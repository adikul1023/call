const express = require('express');
const https = require('https');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Import WireGuard Manager
const WireGuardManager = require('./services/wireguard-manager');
const { router: tunnelsRouter, setWireGuardManager } = require('./routes/tunnels');

const app = express();
const DEFAULT_PORT = process.platform === 'win32' ? 3001 : 3000;
const PORT = process.env.PORT || DEFAULT_PORT;
const BIND_IP = process.env.BIND_IP || '0.0.0.0';
const PUBLIC_IP = process.env.PUBLIC_IP || '13.203.160.214';

// Initialize WireGuard Manager
const wgManager = new WireGuardManager();

// Load SSL certificates
let server;
let wss;

try {
  const privateKey = fs.readFileSync('key.pem', 'utf8');
  const certificate = fs.readFileSync('cert.pem', 'utf8');
  const credentials = { key: privateKey, cert: certificate };
  
  server = https.createServer(credentials, app);
  console.log('✅ SSL certificates loaded - using HTTPS/WSS');
} catch (error) {
  console.warn('⚠️  SSL certificates not found - falling back to HTTP/WS');
  console.warn('   Run: openssl to generate certificates');
  server = require('http').createServer(app);
}

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for development
  credentials: true
}));
app.use(express.json());

// Database setup
const db = new sqlite3.Database('./securevoice.db');

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_online BOOLEAN DEFAULT 0
  )`);

  // Friends table
  db.run(`CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (friend_id) REFERENCES users (id),
    UNIQUE(user_id, friend_id)
  )`);

  // Call sessions table (enhanced with tunnel info)
  db.run(`CREATE TABLE IF NOT EXISTS call_sessions (
    id TEXT PRIMARY KEY,
    caller_id INTEGER NOT NULL,
    callee_id INTEGER,
    caller_tunnel_id TEXT,
    callee_tunnel_id TEXT,
    caller_ip TEXT,
    callee_ip TEXT,
    status TEXT DEFAULT 'initiated',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    FOREIGN KEY (caller_id) REFERENCES users (id),
    FOREIGN KEY (callee_id) REFERENCES users (id)
  )`);

  // Signaling messages table
  db.run(`CREATE TABLE IF NOT EXISTS signaling_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    message_type TEXT NOT NULL,
    message_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES call_sessions (id),
    FOREIGN KEY (from_user_id) REFERENCES users (id),
    FOREIGN KEY (to_user_id) REFERENCES users (id)
  )`);

  console.log('✅ Database tables initialized');
});

// ============================================================================
// REST API ROUTES
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    wireguard: wgManager ? 'initialized' : 'not initialized',
    activeTunnels: wgManager ? wgManager.getActiveTunnels().length : 0
  });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  
  db.run(
    'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)',
    [username, hash, salt],
    function(err) {
      if (err) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      
      res.json({ 
        success: true,
        userId: this.lastID,
        username 
      });
    }
  );
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  db.get(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const valid = await bcrypt.compare(password, user.password_hash);
      
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Update last login
      db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP, is_online = 1 WHERE id = ?', [user.id]);
      
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username
        }
      });
    }
  );
});

// Get friends
app.get('/api/friends/:userId', (req, res) => {
  const { userId } = req.params;
  
  db.all(`
    SELECT u.id, u.username, u.is_online, f.status
    FROM friends f
    JOIN users u ON (f.friend_id = u.id)
    WHERE f.user_id = ? AND f.status = 'accepted'
  `, [userId], (err, friends) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({ friends });
  });
});

// Add friend
app.post('/api/friends/add', (req, res) => {
  const { userId, friendUsername } = req.body;
  
  // First find friend by username
  db.get('SELECT id FROM users WHERE username = ?', [friendUsername], (err, friend) => {
    if (err || !friend) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Add friendship
    db.run(
      'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
      [userId, friend.id, 'accepted'],
      function(err) {
        if (err) {
          return res.status(400).json({ error: 'Already friends or request pending' });
        }
        
        // Add reverse friendship
        db.run(
          'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
          [friend.id, userId, 'accepted']
        );
        
        res.json({ success: true, friendId: friend.id });
      }
    );
  });
});

// Initiate call (with automatic tunnel creation)
app.post('/api/calls/initiate', async (req, res) => {
  const { callerId, calleeId } = req.body;
  
  try {
    const callId = uuidv4();
    
    // Create tunnel for caller
    const callerTunnel = await wgManager.createTunnel(callerId, callId);
    
    // Create call session
    db.run(`
      INSERT INTO call_sessions (id, caller_id, callee_id, caller_tunnel_id, caller_ip, status)
      VALUES (?, ?, ?, ?, ?, 'ringing')
    `, [callId, callerId, calleeId, callerTunnel.tunnelId, callerTunnel.ip], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to create call session' });
      }
      
      res.json({
        success: true,
        callId,
        tunnel: {
          id: callerTunnel.tunnelId,
          ip: callerTunnel.ip,
          config: callerTunnel.config,
          configFile: wgManager.generateConfigFile(wgManager.getTunnel(callerTunnel.tunnelId))
        }
      });
      
      // Notify callee via WebSocket (will be handled by WebSocket server)
      broadcastToUser(calleeId, {
        type: 'incoming_call',
        callId,
        from: callerId
      });
    });
    
  } catch (error) {
    console.error('Failed to initiate call:', error);
    res.status(500).json({ error: 'Failed to initiate call', message: error.message });
  }
});

// Accept call (creates tunnel for callee)
app.post('/api/calls/:callId/accept', async (req, res) => {
  const { callId } = req.params;
  const { userId } = req.body;
  
  try {
    // Get call session
    db.get('SELECT * FROM call_sessions WHERE id = ?', [callId], async (err, call) => {
      if (err || !call) {
        return res.status(404).json({ error: 'Call not found' });
      }
      
      // Create tunnel for callee
      const calleeTunnel = await wgManager.createTunnel(userId, callId);
      
      // Update call session
      db.run(`
        UPDATE call_sessions 
        SET callee_tunnel_id = ?, callee_ip = ?, status = 'connected'
        WHERE id = ?
      `, [calleeTunnel.tunnelId, calleeTunnel.ip, callId], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to accept call' });
        }
        
        res.json({
          success: true,
          tunnel: {
            id: calleeTunnel.tunnelId,
            ip: calleeTunnel.ip,
            config: calleeTunnel.config,
            configFile: wgManager.generateConfigFile(wgManager.getTunnel(calleeTunnel.tunnelId))
          },
          callerIp: call.caller_ip // Give callee the caller's tunnel IP
        });
        
        // Notify caller that call was accepted
        broadcastToUser(call.caller_id, {
          type: 'call_accepted',
          callId,
          calleeIp: calleeTunnel.ip
        });
      });
    });
    
  } catch (error) {
    console.error('Failed to accept call:', error);
    res.status(500).json({ error: 'Failed to accept call', message: error.message });
  }
});

// End call (destroys tunnels)
app.post('/api/calls/:callId/end', async (req, res) => {
  const { callId } = req.params;
  
  try {
    // Get call session
    db.get('SELECT * FROM call_sessions WHERE id = ?', [callId], async (err, call) => {
      if (err || !call) {
        return res.status(404).json({ error: 'Call not found' });
      }
      
      // Destroy all tunnels for this call
      await wgManager.destroyCallTunnels(callId);
      
      // Update call session
      db.run(`
        UPDATE call_sessions 
        SET status = 'ended', ended_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [callId], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to end call' });
        }
        
        res.json({ success: true });
        
        // Notify both users
        broadcastToUser(call.caller_id, { type: 'call_ended', callId });
        broadcastToUser(call.callee_id, { type: 'call_ended', callId });
      });
    });
    
  } catch (error) {
    console.error('Failed to end call:', error);
    res.status(500).json({ error: 'Failed to end call', message: error.message });
  }
});

// Mount tunnel routes
app.use('/api/tunnels', tunnelsRouter);
setWireGuardManager(wgManager);

// ============================================================================
// WEBSOCKET SERVER (for signaling)
// ============================================================================

wss = new WebSocket.Server({ server });

// Store WebSocket connections
const clients = new Map(); // userId -> WebSocket

async function endActiveCallsForUser(disconnectedUserId) {
  return new Promise((resolve) => {
    db.all(
      `SELECT * FROM call_sessions
       WHERE status IN ('initiated', 'ringing', 'connected')
         AND (caller_id = ? OR callee_id = ?)`
      ,
      [disconnectedUserId, disconnectedUserId],
      async (err, calls) => {
        if (err || !calls || calls.length === 0) {
          return resolve();
        }

        for (const call of calls) {
          try {
            await wgManager.destroyCallTunnels(call.id);
          } catch (error) {
            console.warn(`⚠️  Failed to destroy tunnels for call ${call.id}:`, error.message);
          }

          db.run(
            `UPDATE call_sessions
             SET status = 'ended', ended_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status != 'ended'`,
            [call.id]
          );

          const otherUserId = call.caller_id === disconnectedUserId ? call.callee_id : call.caller_id;
          if (otherUserId) {
            broadcastToUser(otherUserId, { type: 'call_ended', callId: call.id });
          }
        }

        resolve();
      }
    );
  });
}

wss.on('connection', (ws) => {
  let userId = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'register':
          userId = data.userId;
          clients.set(userId, ws);
          console.log(`✅ User ${userId} connected to WebSocket`);
          break;
          
        case 'webrtc_signal':
          // Forward WebRTC signaling messages
          const targetWs = clients.get(data.to);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'webrtc_signal',
              from: userId,
              signal: data.signal
            }));
          }
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    if (userId) {
      clients.delete(userId);
      console.log(`❌ User ${userId} disconnected`);

      // If the user drops unexpectedly (tab close / network issue), end any active calls
      // so the other side doesn't stay "in call".
      endActiveCallsForUser(userId).catch((e) => {
        console.warn('⚠️  Failed to end active calls for disconnected user:', e.message);
      });
    }
  });
});

// Helper function to broadcast to specific user
function broadcastToUser(userId, message) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// ============================================================================
// START SERVER
// ============================================================================

async function start() {
  try {
    // Initialize WireGuard Manager
    await wgManager.initialize(PUBLIC_IP);
    
    // Start cleanup job (every 10 minutes)
    setInterval(() => {
      wgManager.cleanupStaleTunnels();
    }, 10 * 60 * 1000);
    
    // Start server
    server.listen(PORT, BIND_IP, () => {
      const protocol = server instanceof https.Server ? 'https' : 'http';
      const wsProtocol = server instanceof https.Server ? 'wss' : 'ws';
      const displayIP = BIND_IP === '0.0.0.0' ? 'localhost' : BIND_IP;
      
      console.log('');
      console.log('========================================');
      console.log('🚀 SecureVoice Backend Server');
      console.log('========================================');
      console.log(`📡 API Server: ${protocol}://${displayIP}:${PORT}`);
      console.log(`🔌 WebSocket: ${wsProtocol}://${displayIP}:${PORT}`);
      console.log(`🔐 WireGuard: Enabled (${wgManager.getActiveTunnels().length} active tunnels)`);
      console.log('========================================');
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
