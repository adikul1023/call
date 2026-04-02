/**
 * Backend API Client
 */

const API_BASE = `${window.location.origin}/api`;

class APIClient {
  constructor() {
    this.currentUser = null;
  }

  /**
   * Make API request
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }
    
    return response.json();
  }

  /**
   * Register new user
   */
  async register(username, password) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    
    this.currentUser = data;
    return data;
  }

  /**
   * Login
   */
  async login(username, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    
    this.currentUser = data.user;
    return data.user;
  }

  /**
   * Get friends list
   */
  async getFriends(userId) {
    const data = await this.request(`/friends/${userId}`);
    return data.friends;
  }

  /**
   * Add friend
   */
  async addFriend(userId, friendUsername) {
    return this.request('/friends/add', {
      method: 'POST',
      body: JSON.stringify({ userId, friendUsername })
    });
  }

  /**
   * Initiate call (requests tunnel)
   */
  async initiateCall(callerId, calleeId) {
    return this.request('/calls/initiate', {
      method: 'POST',
      body: JSON.stringify({ callerId, calleeId })
    });
  }

  /**
   * Accept call (gets tunnel)
   */
  async acceptCall(callId, userId) {
    return this.request(`/calls/${callId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  /**
   * End call (destroys tunnels)
   */
  async endCall(callId) {
    return this.request(`/calls/${callId}/end`, {
      method: 'POST'
    });
  }

  /**
   * Get tunnel status
   */
  async getTunnelStatus(tunnelId) {
    return this.request(`/tunnels/${tunnelId}/status`);
  }
}

export default new APIClient();
