/**
 * WebRTC Service
 * Handles peer-to-peer media connection over WireGuard tunnel
 */

import wsClient from './websocket.js';

class WebRTCService {
  constructor() {
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.tunnelIP = null;
    this._disconnectTimer = null;
  }

  /**
   * Initialize WebRTC with tunnel-only mode
   */
  async initialize(tunnelIP) {
    this.tunnelIP = tunnelIP;
    
    // Create peer connection with public STUN fallback for internet testing.
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    
    // Handle incoming tracks
    this.pc.ontrack = (event) => {
      console.log('✅ Receiving remote audio');
      this.remoteStream = event.streams[0];
      
      const remoteAudio = document.getElementById('remoteAudio');
      if (remoteAudio) {
        remoteAudio.srcObject = this.remoteStream;
      }
    };
    
    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 ICE candidate:', event.candidate.candidate);
        
        // Forward via WebSocket
        wsClient.sendSignal(this.remotePeerId, {
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };
    
    // Handle connection state
    this.pc.onconnectionstatechange = () => {
      console.log(`📡 Connection state: ${this.pc.connectionState}`);

      // Clear any pending disconnect timer when state changes.
      if (this._disconnectTimer) {
        clearTimeout(this._disconnectTimer);
        this._disconnectTimer = null;
      }
      
      if (this.pc.connectionState === 'connected') {
        console.log('✅ WebRTC connected!');
        this.onConnected && this.onConnected();
      }
      
      if (this.pc.connectionState === 'disconnected') {
        // Some browsers enter "disconnected" transiently. Give it a short grace window.
        this._disconnectTimer = setTimeout(() => {
          if (this.pc && this.pc.connectionState === 'disconnected') {
            console.error('❌ WebRTC disconnected');
            (this.onDisconnected || this.onFailed)?.call(this);
          }
        }, 3000);
      } else if (this.pc.connectionState === 'failed') {
        console.error('❌ WebRTC connection failed');
        this.onFailed && this.onFailed();
      } else if (this.pc.connectionState === 'closed') {
        (this.onDisconnected || this.onFailed)?.call(this);
      }
    };

    // Extra fallback: ICE state can fail even when connectionState lags.
    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;
      const state = this.pc.iceConnectionState;
      if (state === 'failed') {
        console.error('❌ ICE connection failed');
        this.onFailed && this.onFailed();
      }
    };
    
    console.log('✅ WebRTC initialized (STUN-enabled mode)');
  }

  /**
   * Get local media stream
   */
  async getLocalStream() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false  // Voice only
      });
      
      console.log('✅ Local microphone accessed');
      
      // Add tracks to peer connection
      this.localStream.getTracks().forEach(track => {
        this.pc.addTrack(track, this.localStream);
      });
      
      return this.localStream;
      
    } catch (error) {
      console.error('❌ Failed to get microphone:', error);
      throw error;
    }
  }

  /**
   * Create offer (caller side)
   */
  async createOffer(remotePeerId) {
    this.remotePeerId = remotePeerId;
    
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    
    console.log('📤 Sending offer');
    
    wsClient.sendSignal(remotePeerId, {
      type: 'offer',
      sdp: offer
    });
  }

  /**
   * Handle incoming offer (callee side)
   */
  async handleOffer(remotePeerId, offer) {
    this.remotePeerId = remotePeerId;
    
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    
    console.log('📤 Sending answer');
    
    wsClient.sendSignal(remotePeerId, {
      type: 'answer',
      sdp: answer
    });
  }

  /**
   * Handle incoming answer (caller side)
   */
  async handleAnswer(answer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('✅ Answer received');
  }

  /**
   * Handle ICE candidate
   */
  async handleIceCandidate(candidate) {
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('✅ ICE candidate added');
    } catch (error) {
      console.error('❌ Failed to add ICE candidate:', error);
    }
  }

  /**
   * Close connection
   */
  close() {
    if (this._disconnectTimer) {
      clearTimeout(this._disconnectTimer);
      this._disconnectTimer = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    this.remoteStream = null;
    this.tunnelIP = null;
    
    console.log('📴 WebRTC closed');
  }
}

export default WebRTCService;
