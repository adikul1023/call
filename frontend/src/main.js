import api from './services/api.js';
import wsClient from './services/websocket.js';
import WireGuardClient from './services/wireguard.js';
import WebRTCService from './services/webrtc.js';

// ============================================================================
// Application State
// ============================================================================

const state = {
  currentUser: null,
  friends: [],
  currentCall: null,
  currentTunnel: null,
  wgClient: null,
  webrtc: null
};

// ============================================================================
// DOM Elements
// ============================================================================

const screens = {
  login: document.getElementById('loginScreen'),
  register: document.getElementById('registerScreen'),
  friends: document.getElementById('friendsScreen'),
  call: document.getElementById('callScreen')
};

const elements = {
  // Login
  loginUsername: document.getElementById('loginUsername'),
  loginPassword: document.getElementById('loginPassword'),
  loginBtn: document.getElementById('loginBtn'),
  loginError: document.getElementById('loginError'),
  
  // Register
  registerUsername: document.getElementById('registerUsername'),
  registerPassword: document.getElementById('registerPassword'),
  registerBtn: document.getElementById('registerBtn'),
  registerError: document.getElementById('registerError'),
  
  // Friends
  friendsList: document.getElementById('friendsList'),
  addFriendUsername: document.getElementById('addFriendUsername'),
  addFriendBtn: document.getElementById('addFriendBtn'),
  friendsError: document.getElementById('friendsError'),
  logoutBtn: document.getElementById('logoutBtn'),
  
  // Call
  callStatus: document.getElementById('callStatus'),
  tunnelStatus: document.getElementById('tunnelStatus'),
  localIP: document.getElementById('localIP'),
  remoteIP: document.getElementById('remoteIP'),
  audioIndicator: document.getElementById('audioIndicator'),
  hangupBtn: document.getElementById('hangupBtn'),
  acceptCallBtn: document.getElementById('acceptCallBtn'),
  declineCallBtn: document.getElementById('declineCallBtn'),
  incomingCallActions: document.getElementById('incomingCallActions'),
  
  // WireGuard Modal
  wgModal: document.getElementById('wgModal'),
  wgConfig: document.getElementById('wgConfig'),
  wgConnectedBtn: document.getElementById('wgConnectedBtn'),
  wgCancelBtn: document.getElementById('wgCancelBtn')
};

// ============================================================================
// Screen Management
// ============================================================================

function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[screenName].classList.add('active');
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 5000);
}

// ============================================================================
// Authentication
// ============================================================================

document.getElementById('showRegisterBtn').onclick = () => showScreen('register');
document.getElementById('showLoginBtn').onclick = () => showScreen('login');

elements.loginBtn.onclick = async () => {
  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value;
  
  if (!username || !password) {
    showError('loginError', 'Please enter username and password');
    return;
  }
  
  try {
    elements.loginBtn.disabled = true;
    elements.loginBtn.textContent = 'Logging in...';
    
    state.currentUser = await api.login(username, password);
    
    // Connect WebSocket
    await wsClient.connect(state.currentUser.id);
    setupWebSocketHandlers();
    
    // Load friends
    await loadFriends();
    
    showScreen('friends');
    
  } catch (error) {
    showError('loginError', error.message);
  } finally {
    elements.loginBtn.disabled = false;
    elements.loginBtn.textContent = 'Login';
  }
};

elements.registerBtn.onclick = async () => {
  const username = elements.registerUsername.value.trim();
  const password = elements.registerPassword.value;
  
  if (!username || !password) {
    showError('registerError', 'Please enter username and password');
    return;
  }
  
  if (password.length < 6) {
    showError('registerError', 'Password must be at least 6 characters');
    return;
  }
  
  try {
    elements.registerBtn.disabled = true;
    elements.registerBtn.textContent = 'Registering...';
    
    await api.register(username, password);
    
    showError('registerError', '✅ Registration successful! Please login.');
    elements.registerError.className = 'success-msg';
    
    setTimeout(() => {
      elements.registerError.className = 'error-msg';
      showScreen('login');
    }, 2000);
    
  } catch (error) {
    showError('registerError', error.message);
  } finally {
    elements.registerBtn.disabled = false;
    elements.registerBtn.textContent = 'Register';
  }
};

elements.logoutBtn.onclick = () => {
  wsClient.disconnect();
  state.currentUser = null;
  state.friends = [];
  showScreen('login');
};

// ============================================================================
// Friends Management
// ============================================================================

async function loadFriends() {
  try {
    state.friends = await api.getFriends(state.currentUser.id);
    renderFriends();
  } catch (error) {
    showError('friendsError', 'Failed to load friends');
  }
}

function renderFriends() {
  if (state.friends.length === 0) {
    elements.friendsList.innerHTML = '<p style="text-align:center; color:#999; padding:40px;">No friends yet. Add some!</p>';
    return;
  }
  
  elements.friendsList.innerHTML = state.friends.map(friend => `
    <div class="friend-item">
      <div class="friend-info">
        <div class="friend-avatar">${friend.username[0].toUpperCase()}</div>
        <div>
          <div class="friend-name">
            ${friend.username}
            <span class="status-indicator ${friend.is_online ? '' : 'offline'}"></span>
          </div>
        </div>
      </div>
      <button class="call-btn" onclick="initiateCall(${friend.id}, '${friend.username}')">
        📞 Call
      </button>
    </div>
  `).join('');
}

elements.addFriendBtn.onclick = async () => {
  const username = elements.addFriendUsername.value.trim();
  
  if (!username) {
    showError('friendsError', 'Please enter a username');
    return;
  }
  
  try {
    elements.addFriendBtn.disabled = true;
    await api.addFriend(state.currentUser.id, username);
    
    elements.addFriendUsername.value = '';
    await loadFriends();
    
    showError('friendsError', `✅ Added ${username} as friend!`);
    elements.friendsError.className = 'success-msg';
    setTimeout(() => elements.friendsError.className = 'error-msg', 3000);
    
  } catch (error) {
    showError('friendsError', error.message);
  } finally {
    elements.addFriendBtn.disabled = false;
  }
};

// ============================================================================
// Call Management
// ============================================================================

window.initiateCall = async (friendId, friendName) => {
  try {
    showScreen('call');
    elements.callStatus.textContent = `Calling ${friendName}...`;
    elements.tunnelStatus.textContent = 'Creating secure tunnel...';
    
    // Initiate call - backend creates tunnel
    const response = await api.initiateCall(state.currentUser.id, friendId);
    
    state.currentCall = {
      id: response.callId,
      friendId,
      friendName,
      role: 'caller'
    };
    
    state.currentTunnel = response.tunnel;
    
    // Show WireGuard setup modal
    showWireGuardModal(response.tunnel);
    
  } catch (error) {
    alert('Failed to initiate call: ' + error.message);
    showScreen('friends');
  }
};

function showWireGuardModal(tunnel) {
  elements.wgConfig.textContent = tunnel.configFile;
  elements.localIP.textContent = tunnel.ip;
  elements.wgModal.classList.add('active');
}

elements.wgConnectedBtn.onclick = async () => {
  try {
    elements.wgConnectedBtn.disabled = true;
    elements.wgConnectedBtn.textContent = 'Verifying...';
    
    elements.wgModal.classList.remove('active');
    elements.tunnelStatus.textContent = 'Connected ✅';
    elements.callStatus.textContent = `Waiting for ${state.currentCall.friendName} to accept...`;
    
    // Initialize WebRTC
    await startWebRTC();
    
  } catch (error) {
    alert('Connection failed: ' + error.message);
    endCall();
  } finally {
    elements.wgConnectedBtn.disabled = false;
    elements.wgConnectedBtn.textContent = "I'm Connected";
  }
};

elements.wgCancelBtn.onclick = async () => {
  elements.wgModal.classList.remove('active');
  await endCall();
};

async function startWebRTC() {
  try {
    // Initialize WebRTC service
    state.webrtc = new WebRTCService();
    await state.webrtc.initialize(state.currentTunnel.ip);
    
    // Get local media
    await state.webrtc.getLocalStream();
    
    // Set up handlers
    state.webrtc.onConnected = () => {
      elements.callStatus.textContent = '✅ Call Connected';
      elements.audioIndicator.classList.add('active');
    };
    
    state.webrtc.onFailed = () => {
      alert('Call connection failed');
      endCall();
    };
    
    // Create offer if caller
    if (state.currentCall.role === 'caller') {
      await state.webrtc.createOffer(state.currentCall.friendId);
    }
    
  } catch (error) {
    throw new Error('Failed to start WebRTC: ' + error.message);
  }
}

elements.hangupBtn.onclick = endCall;
elements.declineCallBtn.onclick = endCall;

function cleanupCallLocal() {
  if (state.webrtc) {
    state.webrtc.close();
    state.webrtc = null;
  }

  state.currentCall = null;
  state.currentTunnel = null;

  elements.audioIndicator.classList.remove('active');
  elements.wgModal.classList.remove('active');

  showScreen('friends');
}

async function endCall(options = {}) {
  const { notifyServer = true } = options;

  const callId = state.currentCall?.id;
  const friendId = state.currentCall?.friendId;

  try {
    // Best-effort: tell the peer to hang up immediately.
    // (This covers cases where the REST call fails or is slow.)
    if (notifyServer && friendId) {
      wsClient.sendSignal(friendId, { type: 'hangup' });
    }

    if (notifyServer && callId) {
      await api.endCall(callId);
    }
  } catch (error) {
    console.error('Error ending call:', error);
  } finally {
    cleanupCallLocal();
  }
}

// ============================================================================
// WebSocket Handlers
// ============================================================================

function setupWebSocketHandlers() {
  // Incoming call
  wsClient.on('incoming_call', async (data) => {
    const friend = state.friends.find(f => f.id === data.from);
    const friendName = friend ? friend.username : 'Unknown';
    
    showScreen('call');
    elements.incomingCallActions.style.display = 'flex';
    elements.callStatus.textContent = `Incoming call from ${friendName}`;
    elements.tunnelStatus.textContent = 'Waiting for response...';
    
    state.currentCall = {
      id: data.callId,
      friendId: data.from,
      friendName,
      role: 'callee'
    };
  });
  
  // Call accepted
  wsClient.on('call_accepted', (data) => {
    elements.remoteIP.textContent = data.calleeIp;
    elements.callStatus.textContent = '✅ Call Accepted - Connecting...';
  });
  
  // Call ended
  wsClient.on('call_ended', () => {
    endCall({ notifyServer: false });
  });
  
  // WebRTC signaling
  wsClient.on('webrtc_signal', async (data) => {
    const signal = data.signal;

    // Peer explicitly hung up (handle even if we haven't initialized WebRTC yet).
    if (signal?.type === 'hangup') {
      endCall({ notifyServer: false });
      return;
    }

    if (!state.webrtc) return;
    
    if (signal.type === 'offer') {
      await state.webrtc.handleOffer(data.from, signal.sdp);
    } else if (signal.type === 'answer') {
      await state.webrtc.handleAnswer(signal.sdp);
    } else if (signal.type === 'ice-candidate') {
      await state.webrtc.handleIceCandidate(signal.candidate);
    }
  });
}

elements.acceptCallBtn.onclick = async () => {
  try {
    elements.acceptCallBtn.disabled = true;
    elements.acceptCallBtn.textContent = 'Accepting...';
    elements.tunnelStatus.textContent = 'Creating secure tunnel...';
    
    // Accept call - backend creates tunnel
    const response = await api.acceptCall(state.currentCall.id, state.currentUser.id);
    
    state.currentTunnel = response.tunnel;
    elements.remoteIP.textContent = response.callerIp;
    
    // Show WireGuard setup
    showWireGuardModal(response.tunnel);
    elements.incomingCallActions.style.display = 'none';
    
  } catch (error) {
    alert('Failed to accept call: ' + error.message);
    endCall();
  } finally {
    elements.acceptCallBtn.disabled = false;
    elements.acceptCallBtn.textContent = 'Accept';
  }
};

// ============================================================================
// Initialize
// ============================================================================

console.log('🚀 SecureVoice Frontend Initialized');
console.log('Backend API:', api);
