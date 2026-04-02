# SecureVoice - Separated Architecture with Dynamic WireGuard Tunnels

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         User A's Computer                               │
│  ┌──────────────────┐                    ┌──────────────────┐          │
│  │  Frontend App    │◄──HTTP/WSS────────►│  WireGuard       │          │
│  │  (React/Vue)     │                    │  Client          │          │
│  └──────────────────┘                    └──────────────────┘          │
│           │                                        │                    │
└───────────┼────────────────────────────────────────┼────────────────────┘
            │                                        │
            │ HTTP/WSS                               │ Encrypted Tunnel
            │ (Auth, Signaling)                      │ (Created per call)
            │                                        │
            ▼                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           AWS Backend                                   │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐ │
│  │  REST API        │    │  WebSocket       │    │  WireGuard       │ │
│  │  (Express)       │    │  Signaling       │    │  Manager         │ │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘ │
│           │                        │                        │           │
│           └────────────────────────┴────────────────────────┘           │
│                              │                                          │
│                    ┌─────────▼──────────┐                              │
│                    │  SQLite Database   │                              │
│                    │  + Tunnel Pool     │                              │
│                    └────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────────┘
            │                                        │
            │                                        │ Encrypted Tunnel
            │ HTTP/WSS                               │ (Same call)
            │                                        │
            ▼                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         User B's Computer                               │
│  ┌──────────────────┐                    ┌──────────────────┐          │
│  │  Frontend App    │◄──HTTP/WSS────────►│  WireGuard       │          │
│  │  (React/Vue)     │                    │  Client          │          │
│  └──────────────────┘                    └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
                    │                                │
                    └────────────────────────────────┘
                        Direct P2P WebRTC Media
                        (inside WireGuard tunnel)
```

---

## 📦 Components

### 1. **Frontend** (Separate Project)
- **Tech**: HTML/CSS/JS or React
- **Runs**: Locally on user's computer (http://localhost:8080)
- **Communicates with**: Backend API via HTTPS + WebSocket
- **Responsibilities**:
  - User authentication
  - Friend management UI
  - Call initiation/receiving
  - WebRTC peer connection (uses tunnel IPs)
  - WireGuard client management

### 2. **Backend** (AWS Hosted)
- **Tech**: Node.js + Express
- **Runs**: AWS EC2 (https://13.203.160.214:3000)
- **Responsibilities**:
  - REST API for auth, users, friends
  - WebSocket signaling server
  - **WireGuard Tunnel Manager**
  - Database management

### 3. **WireGuard Manager** (New Service)
- **Automatically creates tunnels** when call starts
- **Assigns dynamic IPs** from pool (10.0.0.100-200)
- **Provides config** to frontend clients
- **Tears down tunnels** when call ends
- **Monitors** tunnel health

---

## 🔄 Call Flow with Dynamic Tunnels

### Phase 1: User Initiates Call

```
User A → Frontend → Backend API
  POST /api/calls/initiate
  { "to_user_id": 5 }
```

Backend:
1. Creates call session
2. **Generates WireGuard tunnel config** for User A
3. Assigns IP: 10.0.0.100/32
4. Returns tunnel config + session ID

```json
{
  "call_session_id": "abc123",
  "tunnel_config": {
    "private_key": "...",
    "address": "10.0.0.100/32",
    "peer": {
      "public_key": "server_public_key",
      "endpoint": "13.203.160.214:51820",
      "allowed_ips": "10.0.0.0/24"
    }
  }
}
```

### Phase 2: User B Receives Call Notification

```
Backend → User B WebSocket
  { "type": "incoming_call", "from": "User A", "call_id": "abc123" }
```

User B accepts → Backend generates tunnel config for User B:
- Assigns IP: 10.0.0.101/32

### Phase 3: Tunnels Established

Frontend automatically:
1. Creates WireGuard config file
2. Activates tunnel connection
3. Verifies connectivity (ping tunnel gateway)

### Phase 4: WebRTC Connection

Frontend establishes WebRTC peer connection:
- **ICE servers**: EMPTY (no STUN)
- **Local candidates**: Only tunnel IPs (10.0.0.100, 10.0.0.101)
- **Media flows**: Direct P2P inside tunnel

### Phase 5: Call Ends

```
User A → Frontend → Backend API
  POST /api/calls/abc123/hangup
```

Backend:
1. Updates call status
2. **Removes peer from WireGuard server**
3. **Releases IPs** back to pool
4. Notifies User B to tear down tunnel

Frontend:
- Deactivates WireGuard tunnel
- Closes WebRTC connection

---

## 🛠️ Implementation Plan

### **Backend Changes**

#### New Endpoints:
```javascript
// Tunnel Management
POST   /api/tunnels/request        // Get tunnel config for call
DELETE /api/tunnels/:tunnel_id     // Release tunnel
GET    /api/tunnels/:tunnel_id/status  // Check tunnel health

// Call Management (Enhanced)
POST   /api/calls/initiate         // Create call + tunnel
POST   /api/calls/:id/accept       // Accept call + get tunnel
POST   /api/calls/:id/hangup       // End call + cleanup tunnel
```

#### WireGuard Manager Module:
```javascript
class WireGuardManager {
  constructor() {
    this.ipPool = this.generateIPPool(100, 200); // 10.0.0.100-200
    this.activeTunnels = new Map();
  }

  async createTunnel(userId, callId) {
    // 1. Generate client keys
    // 2. Assign IP from pool
    // 3. Add peer to /etc/wireguard/wg0.conf
    // 4. Reload WireGuard: wg syncconf wg0 <(wg-quick strip wg0)
    // 5. Return config
  }

  async destroyTunnel(tunnelId) {
    // 1. Remove peer from config
    // 2. Reload WireGuard
    // 3. Release IP back to pool
  }
}
```

### **Frontend Changes**

#### WireGuard Client Helper:
```javascript
class WireGuardClient {
  async connect(tunnelConfig) {
    // 1. Write config to file
    // 2. Call WireGuard CLI/API to activate
    // 3. Wait for connection
    // 4. Verify with ping
  }

  async disconnect(tunnelId) {
    // 1. Deactivate tunnel
    // 2. Remove config file
  }
}
```

#### Modified WebRTC Setup:
```javascript
async function startCall(friendId) {
  // 1. Request tunnel from backend
  const { tunnel_config, call_id } = await api.post('/api/tunnels/request', { friendId });
  
  // 2. Connect WireGuard
  await wireguardClient.connect(tunnel_config);
  
  // 3. Create RTCPeerConnection with NO STUN servers
  pc = new RTCPeerConnection({
    iceServers: [],  // Tunnel-only mode
    iceCandidatePoolSize: 0
  });
  
  // 4. Continue with normal WebRTC flow
  // ICE candidates will only show tunnel IPs
}
```

---

## 🔐 Security Benefits

✅ **Per-call isolation**: Each call gets unique tunnel with unique keys
✅ **Automatic cleanup**: Tunnels destroyed when call ends
✅ **No standing tunnels**: Reduces attack surface
✅ **Dynamic key rotation**: New keys for every call
✅ **IP pool management**: Prevents IP exhaustion
✅ **Zero trust**: Even if one call is compromised, others unaffected

---

## 📁 New Project Structure

```
SecureVoice/
├── backend/                      # Node.js Backend
│   ├── package.json
│   ├── server.js                 # Main server
│   ├── routes/
│   │   ├── auth.js               # Authentication
│   │   ├── users.js              # User management
│   │   ├── friends.js            # Friends
│   │   ├── calls.js              # Call handling
│   │   └── tunnels.js            # Tunnel management
│   ├── services/
│   │   ├── wireguard-manager.js  # WireGuard automation
│   │   ├── signaling.js          # WebSocket signaling
│   │   └── database.js           # Database layer
│   ├── models/
│   │   ├── User.js
│   │   ├── Call.js
│   │   └── Tunnel.js
│   └── config/
│       └── wireguard.conf.template
│
├── frontend/                     # Web Frontend
│   ├── package.json
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── Login.js
│   │   │   ├── FriendsList.js
│   │   │   └── CallWindow.js
│   │   ├── services/
│   │   │   ├── api.js            # Backend API client
│   │   │   ├── websocket.js      # WebSocket client
│   │   │   ├── webrtc.js         # WebRTC handling
│   │   │   └── wireguard.js      # WireGuard client
│   │   └── App.js
│   └── vite.config.js
│
└── docs/
    ├── API.md                    # REST API documentation
    ├── DEPLOYMENT.md             # Deployment guide
    └── ARCHITECTURE.md           # This file
```

---

## 🚀 Next Steps

1. **Split existing code** into backend/frontend
2. **Implement WireGuard Manager** service
3. **Create REST API** for tunnel management
4. **Build frontend** with WireGuard integration
5. **Test** tunnel creation/destruction cycle
6. **Deploy** backend to AWS
7. **Package** frontend as desktop app (Electron) or web app

---

## ⚡ Quick Start (After Implementation)

**Backend:**
```bash
cd backend
npm install
sudo BIND_IP=0.0.0.0 npm start
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# Opens http://localhost:8080
```

**User Experience:**
1. Open frontend → Login
2. Click friend → "Call"
3. **Tunnel auto-created in background** (2-3 seconds)
4. Call connects via encrypted tunnel
5. Hang up → **Tunnel auto-destroyed**
6. Ready for next call with fresh tunnel
