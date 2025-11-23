const express = require('express');
const https = require('https');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const WSS_PORT = process.env.WSS_PORT || 8080;

// Load SSL certificates
let server;
let wss;

try {
  const privateKey = fs.readFileSync('key.pem', 'utf8');
  const certificate = fs.readFileSync('cert.pem', 'utf8');
  const credentials = { key: privateKey, cert: certificate };
  
  // Create HTTPS server
  server = https.createServer(credentials, app);
  console.log('✅ SSL certificates loaded - using HTTPS/WSS');
} catch (error) {
  console.warn('⚠️  SSL certificates not found - falling back to HTTP/WS');
  console.warn('   Run: node convert-cert.js to generate certificates');
  server = require('http').createServer(app);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

  // Call sessions table
  db.run(`CREATE TABLE IF NOT EXISTS call_sessions (
    id TEXT PRIMARY KEY,
    caller_id INTEGER NOT NULL,
    callee_id INTEGER,
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

  // Automated call settings table
  db.run(`CREATE TABLE IF NOT EXISTS automated_call_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    auto_answer BOOLEAN DEFAULT 0,
    auto_call_friends BOOLEAN DEFAULT 0,
    auto_call_on_online BOOLEAN DEFAULT 0,
    target_friend_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (target_friend_id) REFERENCES users (id)
  )`);

  // Scheduled calls table
  db.run(`CREATE TABLE IF NOT EXISTS scheduled_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caller_id INTEGER NOT NULL,
    callee_id INTEGER NOT NULL,
    scheduled_time DATETIME NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (caller_id) REFERENCES users (id),
    FOREIGN KEY (callee_id) REFERENCES users (id)
  )`);
});

// WebSocket server for real-time signaling (attached to HTTPS server)
wss = new WebSocket.Server({ server });
const connectedUsers = new Map(); // userId -> WebSocket connection

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    // Remove user from connected users
    for (const [userId, connection] of connectedUsers.entries()) {
      if (connection === ws) {
        connectedUsers.delete(userId);
        updateUserOnlineStatus(userId, false);
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });
});

// Authentication endpoints
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    db.get('SELECT id FROM users WHERE username = ?', [username], async (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (row) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      // Hash password with salt
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Insert new user
      db.run(
        'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)',
        [username, passwordHash, salt],
        function(err) {
          if (err) {
            console.error('Error creating user:', err);
            return res.status(500).json({ error: 'Error creating user' });
          }

          res.json({ 
            success: true, 
            message: 'User created successfully',
            userId: this.lastID 
          });
        }
      );
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Update last login and online status
      db.run(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP, is_online = 1 WHERE id = ?',
        [user.id]
      );

      res.json({ 
        success: true, 
        user: {
          id: user.id,
          username: user.username,
          lastLogin: user.last_login
        }
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  const { userId } = req.body;
  
  if (userId) {
    updateUserOnlineStatus(userId, false);
  }
  
  res.json({ success: true });
});

// User management endpoints
app.get('/api/users/online', (req, res) => {
  db.all('SELECT id, username, last_login FROM users WHERE is_online = 1', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ users: rows });
  });
});

app.get('/api/users/:userId/username', (req, res) => {
  const userId = req.params.userId;
  db.get('SELECT username FROM users WHERE id = ?', [userId], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ username: row.username });
  });
});

app.post('/api/friends/add', (req, res) => {
  const { userId, friendUsername } = req.body;
  
  // First, find the friend by username
  db.get('SELECT id FROM users WHERE username = ?', [friendUsername], (err, friend) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!friend) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (friend.id === userId) {
      return res.status(400).json({ error: 'Cannot add yourself as friend' });
    }
    
    // Check if friendship already exists
    db.get('SELECT id FROM friends WHERE user_id = ? AND friend_id = ?', [userId, friend.id], (err, existing) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (existing) {
        return res.status(400).json({ error: 'Friendship already exists' });
      }
      
      // Add friend request (pending status)
      db.run('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)', [userId, friend.id, 'pending'], (err) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        res.json({ success: true, message: 'Friend request sent!' });
        
        // Notify the friend via WebSocket if they're online
        const friendConnection = connectedUsers.get(friend.id);
        if (friendConnection && friendConnection.readyState === WebSocket.OPEN) {
          friendConnection.send(JSON.stringify({
            type: 'friend_request',
            fromUserId: userId
          }));
        }
      });
    });
  });
});

app.get('/api/friends/:userId', (req, res) => {
  const userId = req.params.userId;
  
  db.all(`
    SELECT u.id, u.username, u.is_online, u.last_login 
    FROM friends f 
    JOIN users u ON f.friend_id = u.id 
    WHERE f.user_id = ? AND f.status = 'accepted'
  `, [userId], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ friends: rows });
  });
});

app.get('/api/friends/pending/:userId', (req, res) => {
  const userId = req.params.userId;
  
  db.all(`
    SELECT f.user_id, u.username 
    FROM friends f 
    JOIN users u ON f.user_id = u.id 
    WHERE f.friend_id = ? AND f.status = 'pending'
  `, [userId], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ requests: rows });
  });
});

app.post('/api/friends/accept', (req, res) => {
  const { userId, friendId } = req.body;
  
  // Update the pending request to accepted
  db.run(
    'UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?',
    ['accepted', friendId, userId],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Add reverse friendship (bidirectional)
      db.run(
        'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
        [userId, friendId, 'accepted'],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          res.json({ success: true, message: 'Friend request accepted' });
          
          // Notify the requester via WebSocket if they're online
          const friendConnection = connectedUsers.get(friendId);
          if (friendConnection && friendConnection.readyState === WebSocket.OPEN) {
            friendConnection.send(JSON.stringify({
              type: 'friend_accepted',
              friendId: userId
            }));
          }
        }
      );
    }
  );
});

app.post('/api/friends/reject', (req, res) => {
  const { userId, friendId } = req.body;
  
  // Delete the pending request
  db.run(
    'DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = ?',
    [friendId, userId, 'pending'],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({ success: true, message: 'Friend request rejected' });
    }
  );
});

// Call management endpoints
app.post('/api/call/initiate', (req, res) => {
  const { callerId, calleeId } = req.body;
  const sessionId = uuidv4();
  
  db.run(
    'INSERT INTO call_sessions (id, caller_id, callee_id, status) VALUES (?, ?, ?, ?)',
    [sessionId, callerId, calleeId, 'initiated'],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Notify callee via WebSocket if online
      const calleeConnection = connectedUsers.get(calleeId);
      if (calleeConnection && calleeConnection.readyState === WebSocket.OPEN) {
        calleeConnection.send(JSON.stringify({
          type: 'call_incoming',
          sessionId: sessionId,
          callerId: callerId
        }));
        
        // Check for auto-answer
        checkAndAutoAnswer(calleeId, sessionId);
      }
      
      res.json({ success: true, sessionId: sessionId });
    }
  );
});

app.post('/api/call/accept', (req, res) => {
  const { sessionId, calleeId } = req.body;
  
  db.run(
    'UPDATE call_sessions SET status = ? WHERE id = ? AND callee_id = ?',
    ['accepted', sessionId, calleeId],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({ success: true });
    }
  );
});

// Automated call settings endpoints
app.get('/api/automation/settings/:userId', (req, res) => {
  const userId = req.params.userId;
  
  db.get('SELECT * FROM automated_call_settings WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!row) {
      // Create default settings if none exist
      db.run('INSERT INTO automated_call_settings (user_id) VALUES (?)', [userId], function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        res.json({ 
          userId: userId,
          autoAnswer: false,
          autoCallFriends: false,
          autoCallOnOnline: false,
          targetFriendId: null
        });
      });
    } else {
      res.json({
        userId: row.user_id,
        autoAnswer: row.auto_answer === 1,
        autoCallFriends: row.auto_call_friends === 1,
        autoCallOnOnline: row.auto_call_on_online === 1,
        targetFriendId: row.target_friend_id
      });
    }
  });
});

app.post('/api/automation/settings', (req, res) => {
  const { userId, autoAnswer, autoCallFriends, autoCallOnOnline, targetFriendId } = req.body;
  
  // Check if settings exist
  db.get('SELECT * FROM automated_call_settings WHERE user_id = ?', [userId], (err, existing) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (existing) {
      // Update existing settings
      db.run(
        `UPDATE automated_call_settings 
         SET auto_answer = ?, auto_call_friends = ?, auto_call_on_online = ?, target_friend_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [autoAnswer ? 1 : 0, autoCallFriends ? 1 : 0, autoCallOnOnline ? 1 : 0, targetFriendId || null, userId],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          res.json({ success: true, message: 'Automation settings updated' });
        }
      );
    } else {
      // Insert new settings
      db.run(
        `INSERT INTO automated_call_settings (user_id, auto_answer, auto_call_friends, auto_call_on_online, target_friend_id)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, autoAnswer ? 1 : 0, autoCallFriends ? 1 : 0, autoCallOnOnline ? 1 : 0, targetFriendId || null],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          res.json({ success: true, message: 'Automation settings created' });
        }
      );
    }
  });
});

// Auto-initiate call when friend comes online
function checkAndAutoCall(userId, friendId) {
  db.get(
    `SELECT * FROM automated_call_settings 
     WHERE user_id = ? AND auto_call_on_online = 1 AND (target_friend_id IS NULL OR target_friend_id = ?)`,
    [userId, friendId],
    (err, settings) => {
      if (err || !settings) return;
      
      // Check if there's already an active call
      db.get(
        `SELECT * FROM call_sessions 
         WHERE (caller_id = ? OR callee_id = ?) AND status IN ('initiated', 'accepted')`,
        [userId, userId],
        (err, activeCall) => {
          if (err || activeCall) return;
          
          // Auto-initiate call
          const sessionId = uuidv4();
          db.run(
            'INSERT INTO call_sessions (id, caller_id, callee_id, status) VALUES (?, ?, ?, ?)',
            [sessionId, userId, friendId, 'initiated'],
            (err) => {
              if (err) {
                console.error('Error auto-initiating call:', err);
                return;
              }
              
              // Notify both users
              const callerConnection = connectedUsers.get(userId);
              const calleeConnection = connectedUsers.get(friendId);
              
              if (callerConnection && callerConnection.readyState === WebSocket.OPEN) {
                callerConnection.send(JSON.stringify({
                  type: 'auto_call_initiated',
                  sessionId: sessionId,
                  friendId: friendId
                }));
              }
              
              if (calleeConnection && calleeConnection.readyState === WebSocket.OPEN) {
                calleeConnection.send(JSON.stringify({
                  type: 'call_incoming',
                  sessionId: sessionId,
                  callerId: userId
                }));
                
                // Auto-answer if enabled
                checkAndAutoAnswer(friendId, sessionId);
              }
            }
          );
        }
      );
    }
  );
}

// Auto-answer incoming calls
function checkAndAutoAnswer(userId, sessionId) {
  db.get('SELECT * FROM automated_call_settings WHERE user_id = ? AND auto_answer = 1', [userId], (err, settings) => {
    if (err || !settings) return;
    
    // Auto-accept the call
    db.run(
      'UPDATE call_sessions SET status = ? WHERE id = ? AND callee_id = ?',
      ['accepted', sessionId, userId],
      (err) => {
        if (err) {
          console.error('Error auto-answering call:', err);
          return;
        }
        
        const connection = connectedUsers.get(userId);
        if (connection && connection.readyState === WebSocket.OPEN) {
          connection.send(JSON.stringify({
            type: 'auto_call_accepted',
            sessionId: sessionId
          }));
        }
      }
    );
  });
}

app.post('/api/call/end', (req, res) => {
  const { sessionId } = req.body;
  
  db.run(
    'UPDATE call_sessions SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['ended', sessionId],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({ success: true });
    }
  );
});

// WebSocket message handler
function handleWebSocketMessage(ws, data) {
  switch (data.type) {
    case 'authenticate':
      // Store user connection
      connectedUsers.set(data.userId, ws);
      updateUserOnlineStatus(data.userId, true);
      ws.send(JSON.stringify({ type: 'authenticated', success: true }));
      
      // Check for friends that came online and trigger auto-call if enabled
      setTimeout(() => {
        db.all(
          `SELECT DISTINCT f.friend_id 
           FROM friends f
           JOIN users u ON f.friend_id = u.id
           WHERE f.user_id = ? AND f.status = 'accepted' AND u.is_online = 1`,
          [data.userId],
          (err, friends) => {
            if (!err && friends) {
              friends.forEach(friend => {
                checkAndAutoCall(data.userId, friend.friend_id);
              });
            }
          }
        );
      }, 1000); // Wait 1 second after login to check
      break;
      
    case 'signaling_message':
      // Forward signaling message to target user
      const targetConnection = connectedUsers.get(data.toUserId);
      if (targetConnection && targetConnection.readyState === WebSocket.OPEN) {
        targetConnection.send(JSON.stringify({
          type: 'signaling_message',
          fromUserId: data.fromUserId,
          sessionId: data.sessionId,
          messageType: data.messageType,
          messageData: data.messageData
        }));
      }
      break;
      
    case 'call_response':
      // Forward call response to caller
      const callerConnection = connectedUsers.get(data.callerId);
      if (callerConnection && callerConnection.readyState === WebSocket.OPEN) {
        callerConnection.send(JSON.stringify({
          type: 'call_response',
          sessionId: data.sessionId,
          accepted: data.accepted
        }));
      }
      break;
      
    case 'refresh_friends':
      // Client requesting to refresh friend lists
      ws.send(JSON.stringify({ type: 'refresh_friends' }));
      break;
      
    case 'call_ended':
      // Forward call ended message to the other user
      const otherUserConnection = connectedUsers.get(data.toUserId);
      if (otherUserConnection && otherUserConnection.readyState === WebSocket.OPEN) {
        otherUserConnection.send(JSON.stringify({
          type: 'call_ended',
          fromUserId: data.fromUserId,
          sessionId: data.sessionId
        }));
      }
      break;
      
    case 'video_toggle':
      // Forward video toggle message to the other user
      const peerConnection = connectedUsers.get(data.toUserId);
      if (peerConnection && peerConnection.readyState === WebSocket.OPEN) {
        peerConnection.send(JSON.stringify({
          type: 'video_toggle',
          fromUserId: data.fromUserId,
          videoEnabled: data.videoEnabled
        }));
      }
      break;
  }
}

function updateUserOnlineStatus(userId, isOnline) {
  db.run(
    'UPDATE users SET is_online = ? WHERE id = ?',
    [isOnline ? 1 : 0, userId],
    () => {
      // If user came online, check if any friends want to auto-call them
      if (isOnline) {
        setTimeout(() => {
          db.all(
            `SELECT DISTINCT f.user_id 
             FROM friends f
             WHERE f.friend_id = ? AND f.status = 'accepted'`,
            [userId],
            (err, friends) => {
              if (!err && friends) {
                friends.forEach(friend => {
                  checkAndAutoCall(friend.user_id, userId);
                });
              }
            }
          );
        }, 500);
      }
    }
  );
}

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Bind to specific IP (VPN interface in production, localhost for development)
const BIND_IP = process.env.BIND_IP || '0.0.0.0';

server.listen(PORT, BIND_IP, () => {
  const protocol = server instanceof https.Server ? 'https' : 'http';
  const wsProtocol = server instanceof https.Server ? 'wss' : 'ws';
  const displayIP = BIND_IP === '0.0.0.0' ? 'localhost' : BIND_IP;
  
  console.log(`🌐 Server running on ${protocol}://${displayIP}:${PORT}`);
  console.log(`🔒 WebSocket server running on ${wsProtocol}://${displayIP}:${PORT}`);
  
  if (BIND_IP !== '0.0.0.0') {
    console.log(`🔐 Server bound to VPN interface: ${BIND_IP}`);
  }
  
  if (server instanceof https.Server) {
    console.log('\n⚠️  Using self-signed certificate - you may see browser warnings');
    console.log('   Click "Advanced" → "Proceed to localhost" to continue\n');
  }
});
