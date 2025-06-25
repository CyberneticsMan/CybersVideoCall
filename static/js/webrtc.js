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
        
        // WebRTC configuration with STUN and TURN servers
        this.rtcConfiguration = {
            iceServers: [
                // Google STUN servers
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                
                // Additional STUN servers for better connectivity
                { urls: 'stun:stunserver.org' },
                { urls: 'stun:stun.softjoys.com' },
                { urls: 'stun:stun.voiparound.com' },
                { urls: 'stun:stun.voipbuster.com' },
                { urls: 'stun:stun.voipstunt.com' },
                
                // Free TURN servers (for production, use your own TURN server)
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ],
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
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
        
        // Enhanced ICE candidate handling with logging
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`Sending ICE candidate to ${userId}:`, event.candidate.type);
                this.sendMessage({
                    type: 'webrtc_ice_candidate',
                    target_user: userId,
                    candidate: event.candidate
                });
            } else {
                console.log(`ICE gathering completed for ${userId}`);
            }
        };
        
        // Enhanced connection state monitoring
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            console.log(`Connection state with ${userId}:`, state);
            this.updateConnectionStatus(userId, state);
            
            // Log connection failure details
            if (state === 'failed') {
                console.error(`Connection failed with ${userId}`);
                this.handleConnectionFailure(userId, peerConnection);
            }
        };
        
        // ICE connection state monitoring
        peerConnection.oniceconnectionstatechange = () => {
            const iceState = peerConnection.iceConnectionState;
            console.log(`ICE connection state with ${userId}:`, iceState);
            
            if (iceState === 'failed' || iceState === 'disconnected') {
                console.warn(`ICE connection issue with ${userId}:`, iceState);
                setTimeout(() => {
                    if (peerConnection.iceConnectionState === 'failed') {
                        this.attemptIceRestart(userId);
                    }
                }, 5000);
            }
        };
        
        // ICE gathering state monitoring
        peerConnection.onicegatheringstatechange = () => {
            console.log(`ICE gathering state with ${userId}:`, peerConnection.iceGatheringState);
        };
        
        this.peerConnections.set(userId, peerConnection);
        return peerConnection;
    }

    handleConnectionFailure(userId, peerConnection) {
        console.log(`Attempting to recover connection with ${userId}`);
        
        // Try ICE restart first
        setTimeout(() => {
            if (this.peerConnections.has(userId)) {
                this.attemptIceRestart(userId);
            }
        }, 2000);
    }

    async attemptIceRestart(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (!peerConnection) return;
        
        try {
            console.log(`Attempting ICE restart for ${userId}`);
            const offer = await peerConnection.createOffer({ iceRestart: true });
            await peerConnection.setLocalDescription(offer);
            
            this.sendMessage({
                type: 'webrtc_offer',
                target_user: userId,
                offer: offer,
                isRestart: true
            });
        } catch (error) {
            console.error(`ICE restart failed for ${userId}:`, error);
        }
    }

    async createOffer(userId) {
        const peerConnection = this.peerConnections.get(userId);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        return offer;
    }

    async handleOffer(message) {
        const { sender, offer, isRestart } = message;
        
        console.log(`Received ${isRestart ? 'restart ' : ''}offer from ${sender}`);
        
        // Create peer connection if it doesn't exist
        if (!this.peerConnections.has(sender)) {
            await this.createPeerConnection(sender);
        }
        
        const peerConnection = this.peerConnections.get(sender);
        
        try {
            await peerConnection.setRemoteDescription(offer);
            
            // Create and send answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            this.sendMessage({
                type: 'webrtc_answer',
                target_user: sender,
                answer: answer
            });
            
            console.log(`Sent answer to ${sender}`);
        } catch (error) {
            console.error(`Error handling offer from ${sender}:`, error);
        }
    }

    async handleAnswer(message) {
        const { sender, answer } = message;
        const peerConnection = this.peerConnections.get(sender);
        
        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(answer);
                console.log(`Set remote description from ${sender}`);
            } catch (error) {
                console.error(`Error setting remote description from ${sender}:`, error);
            }
        }
    }

    async handleIceCandidate(message) {
        const { sender, candidate } = message;
        const peerConnection = this.peerConnections.get(sender);
        
        if (peerConnection && peerConnection.remoteDescription) {
            try {
                await peerConnection.addIceCandidate(candidate);
                console.log(`Added ICE candidate from ${sender}:`, candidate.type);
            } catch (error) {
                console.error(`Error adding ICE candidate from ${sender}:`, error);
            }
        } else {
            console.warn(`Received ICE candidate from ${sender} but peer connection not ready`);
        }
    }

    // Add connection diagnostics
    async getConnectionStats(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (!peerConnection) return null;
        
        try {
            const stats = await peerConnection.getStats();
            const report = {};
            
            stats.forEach(stat => {
                if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                    report.selectedCandidatePair = stat;
                } else if (stat.type === 'local-candidate' && stat.id === report.selectedCandidatePair?.localCandidateId) {
                    report.localCandidate = stat;
                } else if (stat.type === 'remote-candidate' && stat.id === report.selectedCandidatePair?.remoteCandidateId) {
                    report.remoteCandidate = stat;
                }
            });
            
            return report;
        } catch (error) {
            console.error(`Error getting stats for ${userId}:`, error);
            return null;
        }
    }

    // Add network type detection
    async detectNetworkType() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            console.log('Network info:', {
                effectiveType: connection.effectiveType,
                downlink: connection.downlink,
                rtt: connection.rtt
            });
        }
    }

    removeVideoElement(userId) {
        const videoContainer = document.getElementById(`video-${userId}`);
        if (videoContainer) {
            videoContainer.remove();
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
        
        // Add fullscreen button
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'video-fullscreen-btn';
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = 'Fullscreen';
        fullscreenBtn.onclick = () => this.enterVideoFullscreen(video, userId);
        
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
        videoContainer.appendChild(fullscreenBtn);
        videoContainer.appendChild(overlay);
        
        // Add click to fullscreen functionality
        videoContainer.addEventListener('dblclick', () => {
            this.enterVideoFullscreen(video, userId);
        });
        
        // Add to video grid
        const videoGrid = document.getElementById('videoGrid');
        videoGrid.appendChild(videoContainer);
    }

    enterVideoFullscreen(videoElement, userId) {
        const overlay = document.getElementById('fullscreenOverlay');
        const fullscreenVideo = document.getElementById('fullscreenVideo');
        const fullscreenTitle = document.getElementById('fullscreenTitle');
        
        // Clone the video stream
        fullscreenVideo.srcObject = videoElement.srcObject;
        fullscreenTitle.textContent = userId === 'local' ? 'You (Local)' : `${userId.replace('user_', '').substring(0, 8)} (Remote)`;
        
        overlay.classList.add('active');
        overlay.dataset.userId = userId;
        
        // Store reference for PiP
        this.currentFullscreenVideo = {
            element: fullscreenVideo,
            userId: userId,
            originalVideo: videoElement
        };
    }

    exitVideoFullscreen() {
        const overlay = document.getElementById('fullscreenOverlay');
        overlay.classList.remove('active');
        this.currentFullscreenVideo = null;
    }

    async enablePictureInPicture() {
        if (!this.currentFullscreenVideo) return;
        
        try {
            const pipContainer = document.getElementById('pipContainer');
            const pipVideo = document.getElementById('pipVideo');
            
            // Clone stream to PiP video
            pipVideo.srcObject = this.currentFullscreenVideo.element.srcObject;
            pipContainer.classList.add('active');
            
            // Exit fullscreen
            this.exitVideoFullscreen();
            
            // Enable dragging for PiP
            this.makePipDraggable();
            
        } catch (error) {
            console.error('PiP not supported:', error);
            // Fallback to browser's native PiP if available
            if (this.currentFullscreenVideo.element.requestPictureInPicture) {
                await this.currentFullscreenVideo.element.requestPictureInPicture();
            }
        }
    }

    makePipDraggable() {
        const pipContainer = document.getElementById('pipContainer');
        let isDragging = false;
        let currentX, currentY, initialX, initialY;
        
        pipContainer.addEventListener('mousedown', (e) => {
            initialX = e.clientX - pipContainer.offsetLeft;
            initialY = e.clientY - pipContainer.offsetTop;
            isDragging = true;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                
                pipContainer.style.left = currentX + 'px';
                pipContainer.style.top = currentY + 'px';
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    closePictureInPicture() {
        const pipContainer = document.getElementById('pipContainer');
        pipContainer.classList.remove('active');
    }

    async handleOffer(message) {
        const { sender, offer, isRestart } = message;
        
        console.log(`Received ${isRestart ? 'restart ' : ''}offer from ${sender}`);
        
        // Create peer connection if it doesn't exist
        if (!this.peerConnections.has(sender)) {
            await this.createPeerConnection(sender);
        }
        
        const peerConnection = this.peerConnections.get(sender);
        
        try {
            await peerConnection.setRemoteDescription(offer);
            
            // Create and send answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            this.sendMessage({
                type: 'webrtc_answer',
                target_user: sender,
                answer: answer
            });
            
            console.log(`Sent answer to ${sender}`);
        } catch (error) {
            console.error(`Error handling offer from ${sender}:`, error);
        }
    }

    async handleAnswer(message) {
        const { sender, answer } = message;
        const peerConnection = this.peerConnections.get(sender);
        
        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(answer);
                console.log(`Set remote description from ${sender}`);
            } catch (error) {
                console.error(`Error setting remote description from ${sender}:`, error);
            }
        }
    }

    async handleIceCandidate(message) {
        const { sender, candidate } = message;
        const peerConnection = this.peerConnections.get(sender);
        
        if (peerConnection && peerConnection.remoteDescription) {
            try {
                await peerConnection.addIceCandidate(candidate);
                console.log(`Added ICE candidate from ${sender}:`, candidate.type);
            } catch (error) {
                console.error(`Error adding ICE candidate from ${sender}:`, error);
            }
        } else {
            console.warn(`Received ICE candidate from ${sender} but peer connection not ready`);
        }
    }

    // Add connection diagnostics
    async getConnectionStats(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (!peerConnection) return null;
        
        try {
            const stats = await peerConnection.getStats();
            const report = {};
            
            stats.forEach(stat => {
                if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                    report.selectedCandidatePair = stat;
                } else if (stat.type === 'local-candidate' && stat.id === report.selectedCandidatePair?.localCandidateId) {
                    report.localCandidate = stat;
                } else if (stat.type === 'remote-candidate' && stat.id === report.selectedCandidatePair?.remoteCandidateId) {
                    report.remoteCandidate = stat;
                }
            });
            
            return report;
        } catch (error) {
            console.error(`Error getting stats for ${userId}:`, error);
            return null;
        }
    }

    // Add network type detection
    async detectNetworkType() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            console.log('Network info:', {
                effectiveType: connection.effectiveType,
                downlink: connection.downlink,
                rtt: connection.rtt
            });
        }
    }

    removeVideoElement(userId) {
        const videoContainer = document.getElementById(`video-${userId}`);
        if (videoContainer) {
            videoContainer.remove();
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
        
        // Add fullscreen button
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'video-fullscreen-btn';
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = 'Fullscreen';
        fullscreenBtn.onclick = () => this.enterVideoFullscreen(video, userId);
        
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
        videoContainer.appendChild(fullscreenBtn);
        videoContainer.appendChild(overlay);
        
        // Add click to fullscreen functionality
        videoContainer.addEventListener('dblclick', () => {
            this.enterVideoFullscreen(video, userId);
        });
        
        // Add to video grid
        const videoGrid = document.getElementById('videoGrid');
        videoGrid.appendChild(videoContainer);
    }

    enterVideoFullscreen(videoElement, userId) {
        const overlay = document.getElementById('fullscreenOverlay');
        const fullscreenVideo = document.getElementById('fullscreenVideo');
        const fullscreenTitle = document.getElementById('fullscreenTitle');
        
        // Clone the video stream
        fullscreenVideo.srcObject = videoElement.srcObject;
        fullscreenTitle.textContent = userId === 'local' ? 'You (Local)' : `${userId.replace('user_', '').substring(0, 8)} (Remote)`;
        
        overlay.classList.add('active');
        overlay.dataset.userId = userId;
        
        // Store reference for PiP
        this.currentFullscreenVideo = {
            element: fullscreenVideo,
            userId: userId,
            originalVideo: videoElement
        };
    }

    exitVideoFullscreen() {
        const overlay = document.getElementById('fullscreenOverlay');
        overlay.classList.remove('active');
        this.currentFullscreenVideo = null;
    }

    async enablePictureInPicture() {
        if (!this.currentFullscreenVideo) return;
        
        try {
            const pipContainer = document.getElementById('pipContainer');
            const pipVideo = document.getElementById('pipVideo');
            
            // Clone stream to PiP video
            pipVideo.srcObject = this.currentFullscreenVideo.element.srcObject;
            pipContainer.classList.add('active');
            
            // Exit fullscreen
            this.exitVideoFullscreen();
            
            // Enable dragging for PiP
            this.makePipDraggable();
            
        } catch (error) {
            console.error('PiP not supported:', error);
            // Fallback to browser's native PiP if available
            if (this.currentFullscreenVideo.element.requestPictureInPicture) {
                await this.currentFullscreenVideo.element.requestPictureInPicture();
            }
        }
    }

    makePipDraggable() {
        const pipContainer = document.getElementById('pipContainer');
        let isDragging = false;
        let currentX, currentY, initialX, initialY;
        
        pipContainer.addEventListener('mousedown', (e) => {
            initialX = e.clientX - pipContainer.offsetLeft;
            initialY = e.clientY - pipContainer.offsetTop;
            isDragging = true;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                
                pipContainer.style.left = currentX + 'px';
                pipContainer.style.top = currentY + 'px';
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    closePictureInPicture() {
        const pipContainer = document.getElementById('pipContainer');
        pipContainer.classList.remove('active');
    }

    async handleOffer(message) {
        const { sender, offer, isRestart } = message;
        
        console.log(`Received ${isRestart ? 'restart ' : ''}offer from ${sender}`);
        
        // Create peer connection if it doesn't exist
        if (!this.peerConnections.has(sender)) {
            await this.createPeerConnection(sender);
        }
        
        const peerConnection = this.peerConnections.get(sender);
        
        try {
            await peerConnection.setRemoteDescription(offer);
            
            // Create and send answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            this.sendMessage({
                type: 'webrtc_answer',
                target_user: sender,
                answer: answer
            });
            
            console.log(`Sent answer to ${sender}`);
        } catch (error) {
            console.error(`Error handling offer from ${sender}:`, error);
        }
    }

    async handleAnswer(message) {
        const { sender, answer } = message;
        const peerConnection = this.peerConnections.get(sender);
        
        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(answer);
                console.log(`Set remote description from ${sender}`);
            } catch (error) {
                console.error(`Error setting remote description from ${sender}:`, error);
            }
        }
    }

    async handleIceCandidate(message) {
        const { sender, candidate } = message;
        const peerConnection = this.peerConnections.get(sender);
        
        if (peerConnection && peerConnection.remoteDescription) {
            try {
                await peerConnection.addIceCandidate(candidate);
                console.log(`Added ICE candidate from ${sender}:`, candidate.type);
            } catch (error) {
                console.error(`Error adding ICE candidate from ${sender}:`, error);
            }
        } else {
            console.warn(`Received ICE candidate from ${sender} but peer connection not ready`);
        }
    }

    // Add connection diagnostics
    async getConnectionStats(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (!peerConnection) return null;
        
        try {
            const stats = await peerConnection.getStats();
            const report = {};
            
            stats.forEach(stat => {
                if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                    report.selectedCandidatePair = stat;
                } else if (stat.type === 'local-candidate' && stat.id === report.selectedCandidatePair?.localCandidateId) {
                    report.localCandidate = stat;
                } else if (stat.type === 'remote-candidate' && stat.id === report.selectedCandidatePair?.remoteCandidateId) {
                    report.remoteCandidate = stat;
                }
            });
            
            return report;
        } catch (error) {
            console.error(`Error getting stats for ${userId}:`, error);
            return null;
        }
    }

    // Add network type detection
    async detectNetworkType() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            console.log('Network info:', {
                effectiveType: connection.effectiveType,
                downlink: connection.downlink,
                rtt: connection.rtt
            });
        }
    }

    removeVideoElement(userId) {
        const videoContainer = document.getElementById(`video-${userId}`);
        if (videoContainer) {
            videoContainer.remove();
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
        
        // Add fullscreen button
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'video-fullscreen-btn';
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = 'Fullscreen';
        fullscreenBtn.onclick = () => this.enterVideoFullscreen(video, userId);
        
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
        videoContainer.appendChild(fullscreenBtn);
        videoContainer.appendChild(overlay);
        
        // Add click to fullscreen functionality
        videoContainer.addEventListener('dblclick', () => {
            this.enterVideoFullscreen(video, userId);
        });
        
        // Add to video grid
        const videoGrid = document.getElementById('videoGrid');
        videoGrid.appendChild(videoContainer);
    }

    enterVideoFullscreen(videoElement, userId) {
        const overlay = document.getElementById('fullscreenOverlay');
        const fullscreenVideo = document.getElementById('fullscreenVideo');
        const fullscreenTitle = document.getElementById('fullscreenTitle');
        
        // Clone the video stream
        fullscreenVideo.srcObject = videoElement.srcObject;
        fullscreenTitle.textContent = userId === 'local' ? 'You (Local)' : `${userId.replace('user_', '').substring(0, 8)} (Remote)`;
        
        overlay.classList.add('active');
        overlay.dataset.userId = userId;
        
        // Store reference for PiP
        this.currentFullscreenVideo = {
            element: fullscreenVideo,
            userId: userId,
            originalVideo: videoElement
        };
    }

    exitVideoFullscreen() {
        const overlay = document.getElementById('fullscreenOverlay');
        overlay.classList.remove('active');
        this.currentFullscreenVideo = null;
    }

    async enablePictureInPicture() {
        if (!this.currentFullscreenVideo) return;
        
        try {
            const pipContainer = document.getElementById('pipContainer');
            const pipVideo = document.getElementById('pipVideo');
            
            // Clone stream to PiP video
            pipVideo.srcObject = this.currentFullscreenVideo.element.srcObject;
            pipContainer.classList.add('active');
            
            // Exit fullscreen
            this.exitVideoFullscreen();
            
            // Enable dragging for PiP
            this.makePipDraggable();
            
        } catch (error) {
            console.error('PiP not supported:', error);
            // Fallback to browser's native PiP if available
            if (this.currentFullscreenVideo.element.requestPictureInPicture) {
                await this.currentFullscreenVideo.element.requestPictureInPicture();
            }
        }
    }

    makePipDraggable() {
        const pipContainer = document.getElementById('pipContainer');
        let isDragging = false;
        let currentX, currentY, initialX, initialY;
        
        pipContainer.addEventListener('mousedown', (e) => {
            initialX = e.clientX - pipContainer.offsetLeft;
            initialY = e.clientY - pipContainer.offsetTop;
            isDragging = true;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                
                pipContainer.style.left = currentX + 'px';
                pipContainer.style.top = currentY + 'px';
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    closePictureInPicture() {
        const pipContainer = document.getElementById('pipContainer');
        pipContainer.classList.remove('active');
    }

    async handleOffer(message) {
        const { sender, offer, isRestart } = message;
        
        console.log(`Received ${isRestart ? 'restart ' : ''}offer from ${sender}`);
        
        // Create peer connection if it doesn't exist
        if (!this.peerConnections.has(sender)) {
            await this.createPeerConnection(sender);
        }
        
        const peerConnection = this.peerConnections.get(sender);
        
        try {
            await peerConnection.setRemoteDescription(offer);
            
            // Create and send answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            this.sendMessage({
                type: 'webrtc_answer',
                target_user: sender,
                answer: answer
            });
            
            console.log(`Sent answer to ${sender}`);
        } catch (error) {
            console.error(`Error handling offer from ${sender}:`, error);
        }
    }

    async handleAnswer(message) {
        const { sender, answer } = message;
        const peerConnection = this.peerConnections.get(sender);
        
        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(answer);
                console.log(`Set remote description from ${sender}`);
            } catch (error) {
                console.error(`Error setting remote description from ${sender}:`, error);
            }
        }
    }

    async handleIceCandidate(message) {
        const { sender, candidate } = message;
        const peerConnection = this.peerConnections.get(sender);
        
        if (peerConnection && peerConnection.remoteDescription) {
            try {
                await peerConnection.addIceCandidate(candidate);
                console.log(`Added ICE candidate from ${sender}:`, candidate.type);
            } catch (error) {
                console.error(`Error adding ICE candidate from ${sender}:`, error);
            }
        } else {
            console.warn(`Received ICE candidate from ${sender} but peer connection not ready`);
        }
    }

    // Add connection diagnostics
    async getConnectionStats(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (!peerConnection) return null;
        
        try {
            const stats = await peerConnection.getStats();
            const report = {};
            
            stats.forEach(stat => {
                if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                    report.selectedCandidatePair = stat;
                } else if (stat.type === 'local-candidate' && stat.id === report.selectedCandidatePair?.localCandidateId) {
                    report.localCandidate = stat;
                } else if (stat.type === 'remote-candidate' && stat.id === report.selectedCandidatePair?.remoteCandidateId) {
                    report.remoteCandidate = stat;
                }
            });
            
            return report;
        } catch (error) {
            console.error(`Error getting stats for ${userId}:`, error);
            return null;
        }
    }

    // Add network type detection
    async detectNetworkType() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            console.log('Network info:', {
                effectiveType: connection.effectiveType,
                downlink: connection.downlink,
                rtt: connection.rtt
            });
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