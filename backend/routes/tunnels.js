const express = require('express');
const WireGuardManager = require('../services/wireguard-manager');

const router = express.Router();

// Initialize WireGuard Manager (will be set by server)
let wgManager;

function setWireGuardManager(manager) {
  wgManager = manager;
}

/**
 * POST /api/tunnels/request
 * Request a new tunnel for a call
 */
router.post('/request', async (req, res) => {
  try {
    const { userId, callId } = req.body;
    
    if (!userId || !callId) {
      return res.status(400).json({ error: 'userId and callId required' });
    }
    
    const tunnel = await wgManager.createTunnel(userId, callId);
    
    res.json({
      success: true,
      tunnel: {
        id: tunnel.tunnelId,
        ip: tunnel.ip,
        config: tunnel.config,
        configFile: wgManager.generateConfigFile(wgManager.getTunnel(tunnel.tunnelId))
      }
    });
    
  } catch (error) {
    console.error('Failed to create tunnel:', error);
    res.status(500).json({ 
      error: 'Failed to create tunnel',
      message: error.message 
    });
  }
});

/**
 * DELETE /api/tunnels/:tunnelId
 * Destroy a tunnel
 */
router.delete('/:tunnelId', async (req, res) => {
  try {
    const { tunnelId } = req.params;
    
    await wgManager.destroyTunnel(tunnelId);
    
    res.json({
      success: true,
      message: 'Tunnel destroyed'
    });
    
  } catch (error) {
    console.error('Failed to destroy tunnel:', error);
    res.status(500).json({ 
      error: 'Failed to destroy tunnel',
      message: error.message 
    });
  }
});

/**
 * GET /api/tunnels/:tunnelId/status
 * Get tunnel status
 */
router.get('/:tunnelId/status', async (req, res) => {
  try {
    const { tunnelId } = req.params;
    
    const status = await wgManager.getTunnelStatus(tunnelId);
    
    res.json({
      success: true,
      status
    });
    
  } catch (error) {
    console.error('Failed to get tunnel status:', error);
    res.status(500).json({ 
      error: 'Failed to get status',
      message: error.message 
    });
  }
});

/**
 * GET /api/tunnels/active
 * Get all active tunnels (admin)
 */
router.get('/active', async (req, res) => {
  try {
    const tunnels = wgManager.getActiveTunnels();
    
    res.json({
      success: true,
      count: tunnels.length,
      tunnels: tunnels.map(t => ({
        id: t.id,
        userId: t.userId,
        callId: t.callId,
        ip: t.ip,
        createdAt: t.createdAt
      }))
    });
    
  } catch (error) {
    console.error('Failed to get active tunnels:', error);
    res.status(500).json({ 
      error: 'Failed to get tunnels',
      message: error.message 
    });
  }
});

/**
 * POST /api/tunnels/cleanup
 * Manually trigger cleanup of stale tunnels
 */
router.post('/cleanup', async (req, res) => {
  try {
    await wgManager.cleanupStaleTunnels();
    
    res.json({
      success: true,
      message: 'Cleanup completed'
    });
    
  } catch (error) {
    console.error('Failed to cleanup tunnels:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup',
      message: error.message 
    });
  }
});

module.exports = { router, setWireGuardManager };
