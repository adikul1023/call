const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const execAsync = promisify(exec);

/**
 * WireGuard Tunnel Manager
 * Handles dynamic tunnel creation/destruction for each call
 */
class WireGuardManager {
  constructor() {
    this.ipPool = this.generateIPPool(100, 200); // 10.0.0.100-200
    this.activeTunnels = new Map();
    this.configPath = '/etc/wireguard/wg0.conf';
    this.serverPublicKey = null;
    this.serverEndpoint = null;

    // Windows/dev environments typically don't have Linux WireGuard tooling.
    // Enable a mock mode so the backend API/WS server can still run.
    this.mockMode = process.env.MOCK_WIREGUARD === '1' || process.platform === 'win32';
  }

  /**
   * Initialize manager - load server config
   */
  async initialize(serverEndpoint) {
    this.serverEndpoint = serverEndpoint;
    try {
      this.serverPublicKey = await this.getServerPublicKey();
      console.log('✅ WireGuard Manager initialized');
      console.log(`   Server Public Key: ${this.serverPublicKey}`);
      console.log(`   Available IPs: 10.0.0.100-200`);

      if (this.mockMode) {
        console.log('   ⚠️  WireGuard mock mode enabled (no wg/sudo calls)');
      }
    } catch (error) {
      console.error('❌ Failed to initialize WireGuard Manager:', error.message);
      throw error;
    }
  }

  /**
   * Generate IP pool for tunnel assignments
   */
  generateIPPool(start, end) {
    const pool = [];
    for (let i = start; i <= end; i++) {
      pool.push(`10.0.0.${i}`);
    }
    return pool;
  }

  /**
   * Get server's public key
   */
  async getServerPublicKey() {
    if (this.mockMode) {
      return process.env.WG_SERVER_PUBLIC_KEY || 'MOCK_SERVER_PUBLIC_KEY';
    }
    try {
      const { stdout } = await execAsync('sudo cat /etc/wireguard/server_public.key');
      return stdout.trim();
    } catch (error) {
      throw new Error('Could not read server public key');
    }
  }

  /**
   * Generate WireGuard key pair
   */
  async generateKeyPair() {
    if (this.mockMode) {
      // These are placeholders for local/dev. They are not real WireGuard keys.
      return {
        privateKey: crypto.randomBytes(32).toString('base64'),
        publicKey: crypto.randomBytes(32).toString('base64')
      };
    }
    try {
      const { stdout: privateKey } = await execAsync('wg genkey');
      const { stdout: publicKey } = await execAsync(`echo "${privateKey.trim()}" | wg pubkey`);
      
      return {
        privateKey: privateKey.trim(),
        publicKey: publicKey.trim()
      };
    } catch (error) {
      throw new Error('Failed to generate WireGuard keys');
    }
  }

  /**
   * Assign IP from pool
   */
  assignIP() {
    if (this.ipPool.length === 0) {
      throw new Error('IP pool exhausted');
    }
    return this.ipPool.shift();
  }

  /**
   * Release IP back to pool
   */
  releaseIP(ip) {
    if (!this.ipPool.includes(ip)) {
      this.ipPool.push(ip);
      this.ipPool.sort((a, b) => {
        const aNum = parseInt(a.split('.')[3]);
        const bNum = parseInt(b.split('.')[3]);
        return aNum - bNum;
      });
    }
  }

  /**
   * Create tunnel for a user in a call
   */
  async createTunnel(userId, callId) {
    try {
      console.log(`📡 Creating tunnel for user ${userId} in call ${callId}`);

      // 1. Generate keys
      const keys = await this.generateKeyPair();
      
      // 2. Assign IP
      const assignedIP = this.assignIP();
      
      // 3. Create tunnel ID
      const tunnelId = `${callId}-${userId}`;
      
      // 4. Add peer to WireGuard server
      await this.addPeerToServer(keys.publicKey, assignedIP);
      
      // 5. Store tunnel info
      const tunnel = {
        id: tunnelId,
        userId,
        callId,
        ip: assignedIP,
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
        createdAt: Date.now()
      };
      
      this.activeTunnels.set(tunnelId, tunnel);
      
      // 6. Generate client config
      const clientConfig = this.generateClientConfig(tunnel);
      
      console.log(`✅ Tunnel created: ${tunnelId} (${assignedIP})`);
      
      return {
        tunnelId,
        config: clientConfig,
        ip: assignedIP
      };
      
    } catch (error) {
      console.error('❌ Failed to create tunnel:', error.message);
      throw error;
    }
  }

  /**
   * Add peer to WireGuard server configuration
   */
  async addPeerToServer(publicKey, ip) {
    if (this.mockMode) {
      console.log(`   (mock) Added peer: ${ip} (${publicKey.substring(0, 8)}...)`);
      return;
    }
    try {
      // Add peer dynamically without restarting WireGuard
      const cmd = `sudo wg set wg0 peer ${publicKey} allowed-ips ${ip}/32`;
      await execAsync(cmd);
      
      // Persist to config file
      const peerConfig = `\n# Peer ${ip}\n[Peer]\nPublicKey = ${publicKey}\nAllowedIPs = ${ip}/32\n`;
      await execAsync(`echo '${peerConfig}' | sudo tee -a ${this.configPath}`);
      
      console.log(`   Added peer: ${ip} (${publicKey.substring(0, 20)}...)`);
    } catch (error) {
      throw new Error(`Failed to add peer to server: ${error.message}`);
    }
  }

  /**
   * Remove peer from WireGuard server
   */
  async removePeerFromServer(publicKey, ip) {
    if (this.mockMode) {
      console.log(`   (mock) Removed peer: ${ip}`);
      return;
    }
    try {
      // Remove peer dynamically
      const cmd = `sudo wg set wg0 peer ${publicKey} remove`;
      await execAsync(cmd);
      
      // Remove from config file (using sed to remove peer block)
      const sedCmd = `sudo sed -i '/# Peer ${ip}/,/AllowedIPs = ${ip}\\/32/d' ${this.configPath}`;
      await execAsync(sedCmd);
      
      console.log(`   Removed peer: ${ip}`);
    } catch (error) {
      console.error(`Warning: Failed to remove peer: ${error.message}`);
    }
  }

  /**
   * Generate client configuration
   */
  generateClientConfig(tunnel) {
    return {
      interface: {
        privateKey: tunnel.privateKey,
        address: `${tunnel.ip}/32`,
        dns: '8.8.8.8'
      },
      peer: {
        publicKey: this.serverPublicKey,
        endpoint: `${this.serverEndpoint}:51820`,
        allowedIPs: '10.0.0.0/24',
        persistentKeepalive: 25
      }
    };
  }

  /**
   * Generate WireGuard config file format
   */
  generateConfigFile(tunnel) {
    const config = this.generateClientConfig(tunnel);
    return `[Interface]
PrivateKey = ${config.interface.privateKey}
Address = ${config.interface.address}
DNS = ${config.interface.dns}

[Peer]
PublicKey = ${config.peer.publicKey}
Endpoint = ${config.peer.endpoint}
AllowedIPs = ${config.peer.allowedIPs}
PersistentKeepalive = ${config.peer.persistentKeepalive}
`;
  }

  /**
   * Destroy tunnel
   */
  async destroyTunnel(tunnelId) {
    try {
      const tunnel = this.activeTunnels.get(tunnelId);
      
      if (!tunnel) {
        console.warn(`⚠️  Tunnel ${tunnelId} not found`);
        return;
      }
      
      console.log(`🗑️  Destroying tunnel: ${tunnelId} (${tunnel.ip})`);
      
      // 1. Remove peer from server
      await this.removePeerFromServer(tunnel.publicKey, tunnel.ip);
      
      // 2. Release IP back to pool
      this.releaseIP(tunnel.ip);
      
      // 3. Remove from active tunnels
      this.activeTunnels.delete(tunnelId);
      
      console.log(`✅ Tunnel destroyed: ${tunnelId}`);
      
    } catch (error) {
      console.error('❌ Failed to destroy tunnel:', error.message);
      throw error;
    }
  }

  /**
   * Destroy all tunnels for a call
   */
  async destroyCallTunnels(callId) {
    const tunnelsToDestroy = Array.from(this.activeTunnels.values())
      .filter(t => t.callId === callId)
      .map(t => t.id);
    
    console.log(`🗑️  Destroying ${tunnelsToDestroy.length} tunnels for call ${callId}`);
    
    for (const tunnelId of tunnelsToDestroy) {
      await this.destroyTunnel(tunnelId);
    }
  }

  /**
   * Get tunnel info
   */
  getTunnel(tunnelId) {
    return this.activeTunnels.get(tunnelId);
  }

  /**
   * Get all active tunnels
   */
  getActiveTunnels() {
    return Array.from(this.activeTunnels.values());
  }

  /**
   * Get tunnel status
   */
  async getTunnelStatus(tunnelId) {
    const tunnel = this.activeTunnels.get(tunnelId);
    
    if (!tunnel) {
      return { active: false };
    }

    if (this.mockMode) {
      return {
        active: true,
        connected: true,
        ip: tunnel.ip,
        lastHandshake: null,
        uptimeSeconds: Math.floor((Date.now() - tunnel.createdAt) / 1000)
      };
    }
    
    try {
      // Check if peer is connected via wg show
      const { stdout } = await execAsync(`sudo wg show wg0 peers`);
      const isConnected = stdout.includes(tunnel.publicKey);
      
      // Get handshake time if connected
      let lastHandshake = null;
      if (isConnected) {
        const { stdout: peerInfo } = await execAsync(
          `sudo wg show wg0 dump | grep ${tunnel.publicKey}`
        );
        const parts = peerInfo.trim().split('\t');
        lastHandshake = parts[4] ? parseInt(parts[4]) : null;
      }
      
      return {
        active: true,
        connected: isConnected,
        ip: tunnel.ip,
        lastHandshake,
        uptimeSeconds: Math.floor((Date.now() - tunnel.createdAt) / 1000)
      };
    } catch (error) {
      return { active: true, connected: false, error: error.message };
    }
  }

  /**
   * Cleanup stale tunnels (older than 1 hour)
   */
  async cleanupStaleTunnels() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const staleTunnels = Array.from(this.activeTunnels.values())
      .filter(t => t.createdAt < oneHourAgo);
    
    if (staleTunnels.length > 0) {
      console.log(`🧹 Cleaning up ${staleTunnels.length} stale tunnels`);
      for (const tunnel of staleTunnels) {
        await this.destroyTunnel(tunnel.id);
      }
    }
  }
}

module.exports = WireGuardManager;
