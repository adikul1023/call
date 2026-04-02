/**
 * WebSocket Client for real-time signaling
 */

const WS_URL = 'wss://13.203.160.214:3000';

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.userId = null;
    this.handlers = new Map();
  }

  /**
   * Connect to WebSocket server
   */
  connect(userId) {
    return new Promise((resolve, reject) => {
      this.userId = userId;
      this.ws = new WebSocket(WS_URL);
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        
        // Register user
        this.send({
          type: 'register',
          userId
        });
        
        resolve();
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
      
      this.ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
      };
    });
  }

  /**
   * Handle incoming message
   */
  handleMessage(data) {
    const handler = this.handlers.get(data.type);
    if (handler) {
      handler(data);
    }
  }

  /**
   * Register message handler
   */
  on(type, handler) {
    this.handlers.set(type, handler);
  }

  /**
   * Send message
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Send WebRTC signaling message
   */
  sendSignal(to, signal) {
    this.send({
      type: 'webrtc_signal',
      to,
      signal
    });
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export default new WebSocketClient();
