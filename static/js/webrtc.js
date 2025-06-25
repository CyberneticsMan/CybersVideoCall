// WebRTC functionality for video and audio calls
class WebRTCManager {
    constructor() {
        this.localStream = null;
        this.screenStream = null;
        this.peerConnections = new Map();
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        this.isScreenSharing = false;
        this.websocket = null;
        this.userId = this.generateUserId();
        this.heartbeatInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // WebRTC configuration with STUN servers
        this.rtcConfiguration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };
        
        this.constraints = {
            video: {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 30, max: 60 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100
            }
        };
    }

    generateUserId() {
        // Use sessionStorage to maintain same user ID during session
        let userId = sessionStorage.getItem('videoCallUserId');
        if (!userId) {
            userId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            sessionStorage.setItem('videoCallUserId', userId);
        }
        return userId;
    }

    async init(roomId) {
        this.roomId = roomId;
        
        try {
            // Get user media
            await this.getUserMedia();
            
            // Connect to WebSocket
            await this.connectWebSocket();
            
            // Join room
            this.sendMessage({
                type: 'join_room',
                room_id: roomId
            });
            
            console.log('WebRTC initialized successfully');
        } catch (error) {
            console.error('Failed to initialize WebRTC:', error);
            throw error;
        }
    }

    async getUserMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(this.constraints);
            
            // Display local video
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }
            
            console.log('Local media stream obtained');
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw new Error('Camera/microphone access denied or not available');
        }
    }

    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/${this.userId}`;
            
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                console.log('WebSocket connected');
                this.reconnectAttempts = 0;
                this.startHeartbeat();
                resolve();
            };
            
            this.websocket.onmessage = (event) => {
                this.handleWebSocketMessage(JSON.parse(event.data));
            };
            
            this.websocket.onclose = (event) => {
                console.log('WebSocket disconnected', event.code, event.reason);
                this.stopHeartbeat();
                
                // Don't reconnect if it was a clean close (user left intentionally)
                if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                    setTimeout(() => this.connectWebSocket(), 3000 * this.reconnectAttempts);
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };
        });
    }

    startHeartbeat() {
        this.stopHeartbeat(); // Clear any existing interval
        this.heartbeatInterval = setInterval(() => {
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.sendMessage({ type: 'heartbeat' });
            }
        }, 30000); // Send heartbeat every 30 seconds
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    sendMessage(message) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify(message));
        }
    }

    async handleWebSocketMessage(message) {
        const { type } = message;
        
        switch (type) {
            case 'user_joined':
                await this.handleUserJoined(message);
                break;
            case 'user_left':
                this.handleUserLeft(message);
                break;
            case 'webrtc_offer':
                await this.handleOffer(message);
                break;
            case 'webrtc_answer':
                await this.handleAnswer(message);
                break;
            case 'webrtc_ice_candidate':
                await this.handleIceCandidate(message);
                break;
            case 'screen_share_start':
                this.handleScreenShareStart(message);
                break;
            case 'screen_share_stop':
                this.handleScreenShareStop(message);
                break;
        }
    }

    async handleUserJoined(message) {
        const { user_id } = message;
        console.log(`User ${user_id} joined`);
        
        // Create peer connection for new user
        await this.createPeerConnection(user_id);
        
        // Create and send offer
        const offer = await this.createOffer(user_id);
        this.sendMessage({
            type: 'webrtc_offer',
            target_user: user_id,
            offer: offer
        });
    }

    handleUserLeft(message) {
        const { user_id } = message;
        console.log(`User ${user_id} left`);
        
        // Close peer connection
        if (this.peerConnections.has(user_id)) {
            this.peerConnections.get(user_id).close();
            this.peerConnections.delete(user_id);
        }
        
        // Remove video element
        this.removeVideoElement(user_id);
    }

    async createPeerConnection(userId) {
        const peerConnection = new RTCPeerConnection(this.rtcConfiguration);
        
        // Add local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }
        
        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from', userId);
            this.addRemoteVideo(userId, event.streams[0]);
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendMessage({
                    type: 'webrtc_ice_candidate',
                    target_user: userId,
                    candidate: event.candidate
                });
            }
        };
        
        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state with ${userId}:`, peerConnection.connectionState);
            this.updateConnectionStatus(userId, peerConnection.connectionState);
        };
        
        this.peerConnections.set(userId, peerConnection);
        return peerConnection;
    }

    async createOffer(userId) {
        const peerConnection = this.peerConnections.get(userId);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        return offer;
    }

    async handleOffer(message) {
        const { sender, offer } = message;
        
        // Create peer connection if it doesn't exist
        if (!this.peerConnections.has(sender)) {
            await this.createPeerConnection(sender);
        }
        
        const peerConnection = this.peerConnections.get(sender);
        await peerConnection.setRemoteDescription(offer);
        
        // Create and send answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        this.sendMessage({
            type: 'webrtc_answer',
            target_user: sender,
            answer: answer
        });
    }

    async handleAnswer(message) {
        const { sender, answer } = message;
        const peerConnection = this.peerConnections.get(sender);
        
        if (peerConnection) {
            await peerConnection.setRemoteDescription(answer);
        }
    }

    async handleIceCandidate(message) {
        const { sender, candidate } = message;
        const peerConnection = this.peerConnections.get(sender);
        
        if (peerConnection) {
            await peerConnection.addIceCandidate(candidate);
        }
    }

    addRemoteVideo(userId, stream) {
        // Remove existing video element if any
        this.removeVideoElement(userId);
        
        // Create new video container
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container remote-video';
        videoContainer.id = `video-${userId}`;
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsinline = true;
        video.srcObject = stream;
        
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        
        const label = document.createElement('span');
        label.className = 'video-label';
        label.textContent = userId.replace('user_', '').substring(0, 8);
        
        const connectionStatus = document.createElement('div');
        connectionStatus.className = 'connection-status';
        connectionStatus.id = `status-${userId}`;
        
        overlay.appendChild(label);
        overlay.appendChild(connectionStatus);
        videoContainer.appendChild(video);
        videoContainer.appendChild(overlay);
        
        // Add to video grid
        const videoGrid = document.getElementById('videoGrid');
        videoGrid.appendChild(videoContainer);
    }

    removeVideoElement(userId) {
        const videoElement = document.getElementById(`video-${userId}`);
        if (videoElement) {
            videoElement.remove();
        }
    }

    updateConnectionStatus(userId, state) {
        const statusElement = document.getElementById(`status-${userId}`);
        if (statusElement) {
            statusElement.className = 'connection-status';
            
            switch (state) {
                case 'connected':
                    statusElement.classList.add('connected');
                    break;
                case 'connecting':
                case 'checking':
                    statusElement.classList.add('connecting');
                    break;
                case 'disconnected':
                case 'failed':
                    statusElement.classList.add('disconnected');
                    break;
            }
        }
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoEnabled = videoTrack.enabled;
            }
        }
        return this.isVideoEnabled;
    }

    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isAudioEnabled = audioTrack.enabled;
            }
        }
        return this.isAudioEnabled;
    }

    async startScreenShare() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { mediaSource: 'screen' },
                audio: true
            });
            
            // Replace video track in all peer connections
            const videoTrack = this.screenStream.getVideoTracks()[0];
            
            for (const [userId, peerConnection] of this.peerConnections) {
                const sender = peerConnection.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                }
            }
            
            // Update local video
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.screenStream;
            }
            
            // Handle screen share end
            videoTrack.onended = () => {
                this.stopScreenShare();
            };
            
            this.isScreenSharing = true;
            
            // Notify other users
            this.sendMessage({
                type: 'screen_share_start'
            });
            
            return true;
        } catch (error) {
            console.error('Error starting screen share:', error);
            return false;
        }
    }

    async stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }
        
        // Replace with camera video
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            
            for (const [userId, peerConnection] of this.peerConnections) {
                const sender = peerConnection.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                }
            }
            
            // Update local video
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }
        }
        
        this.isScreenSharing = false;
        
        // Notify other users
        this.sendMessage({
            type: 'screen_share_stop'
        });
    }

    handleScreenShareStart(message) {
        const { user_id } = message;
        const videoElement = document.querySelector(`#video-${user_id} video`);
        if (videoElement) {
            // Add screen share indicator
            const overlay = videoElement.parentElement.querySelector('.video-overlay');
            if (overlay && !overlay.querySelector('.screen-share-overlay')) {
                const indicator = document.createElement('div');
                indicator.className = 'screen-share-overlay';
                indicator.textContent = '🖥️ Screen Sharing';
                overlay.appendChild(indicator);
            }
        }
    }

    handleScreenShareStop(message) {
        const { user_id } = message;
        const videoElement = document.querySelector(`#video-${user_id} video`);
        if (videoElement) {
            // Remove screen share indicator
            const indicator = videoElement.parentElement.querySelector('.screen-share-overlay');
            if (indicator) {
                indicator.remove();
            }
        }
    }

    async getAvailableDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return {
                cameras: devices.filter(device => device.kind === 'videoinput'),
                microphones: devices.filter(device => device.kind === 'audioinput'),
                speakers: devices.filter(device => device.kind === 'audiooutput')
            };
        } catch (error) {
            console.error('Error getting devices:', error);
            return { cameras: [], microphones: [], speakers: [] };
        }
    }

    async switchCamera(deviceId) {
        try {
            const newConstraints = {
                ...this.constraints,
                video: {
                    ...this.constraints.video,
                    deviceId: { exact: deviceId }
                }
            };
            
            const newStream = await navigator.mediaDevices.getUserMedia(newConstraints);
            const videoTrack = newStream.getVideoTracks()[0];
            
            // Replace track in all peer connections
            for (const [userId, peerConnection] of this.peerConnections) {
                const sender = peerConnection.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                }
            }
            
            // Stop old video track
            if (this.localStream) {
                this.localStream.getVideoTracks().forEach(track => track.stop());
                this.localStream.removeTrack(this.localStream.getVideoTracks()[0]);
                this.localStream.addTrack(videoTrack);
            }
            
            // Update local video
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }
            
            return true;
        } catch (error) {
            console.error('Error switching camera:', error);
            return false;
        }
    }

    disconnect() {
        // Stop heartbeat
        this.stopHeartbeat();
        
        // Send leave room message before disconnecting
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.sendMessage({ type: 'leave_room' });
        }
        
        // Stop all tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
        }
        
        // Close all peer connections
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        
        // Close WebSocket cleanly
        if (this.websocket) {
            this.websocket.close(1000, 'User left'); // Clean close
        }
        
        console.log('WebRTC disconnected');
    }
}

// Export for use in other modules
window.WebRTCManager = WebRTCManager;