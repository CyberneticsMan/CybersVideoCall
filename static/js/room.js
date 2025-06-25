// Main room functionality that coordinates all components
class RoomManager {
    constructor() {
        this.webrtc = null;
        this.whiteboard = null;
        this.chat = null;
        this.roomId = ROOM_ID;
        this.isInitialized = false;
        this.currentTab = 'chat';
        this.participants = new Set();
        this.connectionStatus = {
            websocket: 'disconnected',
            media: 'not-tested',
            network: 'unknown'
        };
    }

    async init() {
        try {
            // Initialize WebRTC
            this.webrtc = new WebRTCManager();
            await this.webrtc.init(this.roomId);

            // Initialize whiteboard
            this.whiteboard = new WhiteboardManager();
            this.whiteboard.init(this.webrtc.websocket);

            // Initialize chat
            this.initChat();

            // Bind UI events
            this.bindEvents();

            // Initialize settings
            await this.initSettings();

            // Set up message handling
            this.setupMessageHandling();

            this.isInitialized = true;
            console.log('Room initialized successfully');
            
            this.showNotification('Successfully joined the room!', 'success');
        } catch (error) {
            console.error('Failed to initialize room:', error);
            this.showNotification('Failed to join room: ' + error.message, 'error');
        }
    }

    bindEvents() {
        // Header controls
        const copyRoomBtn = document.getElementById('copyRoomBtn');
        const leaveRoomBtn = document.getElementById('leaveRoomBtn');

        copyRoomBtn?.addEventListener('click', () => this.copyRoomLink());
        leaveRoomBtn?.addEventListener('click', () => this.leaveRoom());

        // Video controls
        const toggleVideoBtn = document.getElementById('toggleVideoBtn');
        const toggleAudioBtn = document.getElementById('toggleAudioBtn');
        const toggleVideoMainBtn = document.getElementById('toggleVideoMainBtn');
        const toggleAudioMainBtn = document.getElementById('toggleAudioMainBtn');

        toggleVideoBtn?.addEventListener('click', () => this.toggleVideo());
        toggleAudioBtn?.addEventListener('click', () => this.toggleVideo());
        toggleVideoMainBtn?.addEventListener('click', () => this.toggleVideo());
        toggleAudioMainBtn?.addEventListener('click', () => this.toggleAudio());

        // Screen sharing
        const shareScreenBtn = document.getElementById('shareScreenBtn');
        shareScreenBtn?.addEventListener('click', () => this.toggleScreenShare());

        // Sidebar controls
        const toggleWhiteboardBtn = document.getElementById('toggleWhiteboardBtn');
        const toggleChatBtn = document.getElementById('toggleChatBtn');

        toggleWhiteboardBtn?.addEventListener('click', () => this.switchTab('whiteboard'));
        toggleChatBtn?.addEventListener('click', () => this.switchTab('chat'));

        // Fullscreen controls
        const fullscreenWhiteboardBtn = document.getElementById('fullscreenWhiteboardBtn');
        const exitWhiteboardFullscreen = document.getElementById('exitWhiteboardFullscreen');
        
        fullscreenWhiteboardBtn?.addEventListener('click', () => this.enterWhiteboardFullscreen());
        exitWhiteboardFullscreen?.addEventListener('click', () => this.exitWhiteboardFullscreen());

        // Fullscreen video controls
        const fullscreenClose = document.getElementById('fullscreenClose');
        const fullscreenToggleVideo = document.getElementById('fullscreenToggleVideo');
        const fullscreenToggleAudio = document.getElementById('fullscreenToggleAudio');
        const fullscreenPip = document.getElementById('fullscreenPip');
        const fullscreenShare = document.getElementById('fullscreenShare');

        fullscreenClose?.addEventListener('click', () => this.exitVideoFullscreen());
        fullscreenToggleVideo?.addEventListener('click', () => this.toggleVideo());
        fullscreenToggleAudio?.addEventListener('click', () => this.toggleAudio());
        fullscreenPip?.addEventListener('click', () => this.enablePictureInPicture());
        fullscreenShare?.addEventListener('click', () => this.toggleScreenShare());

        // Picture-in-Picture controls
        const pipExpand = document.getElementById('pipExpand');
        const pipClose = document.getElementById('pipClose');
        
        pipExpand?.addEventListener('click', () => this.expandFromPiP());
        pipClose?.addEventListener('click', () => this.closePictureInPicture());

        // Local video fullscreen (double-click on local video)
        const localVideoContainer = document.querySelector('.local-video');
        if (localVideoContainer) {
            localVideoContainer.addEventListener('dblclick', () => {
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    this.webrtc.enterVideoFullscreen(localVideo, 'local');
                }
            });
        }

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Settings
        const settingsBtn = document.getElementById('settingsBtn');
        const closeSettingsBtn = document.getElementById('closeSettingsBtn');
        const settingsModal = document.getElementById('settingsModal');

        settingsBtn?.addEventListener('click', () => this.openSettings());
        closeSettingsBtn?.addEventListener('click', () => this.closeSettings());
        
        settingsModal?.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                this.closeSettings();
            }
        });

        // Connection testing
        const connectionTestBtn = document.getElementById('connectionTestBtn');
        connectionTestBtn?.addEventListener('click', () => this.testConnection());

        // Initialize connection status monitoring
        this.initConnectionStatus();

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // Window events
        window.addEventListener('beforeunload', () => this.cleanup());
        window.addEventListener('resize', () => this.handleResize());

        // Escape key to exit fullscreen modes
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.exitAllFullscreenModes();
            }
        });
    }

    initChat() {
        const chatInput = document.getElementById('chatInput');
        const sendChatBtn = document.getElementById('sendChatBtn');

        const sendMessage = () => {
            const message = chatInput.value.trim();
            if (message && this.webrtc.websocket) {
                this.webrtc.sendMessage({
                    type: 'chat_message',
                    message: message
                });
                
                // Display own message
                this.addChatMessage(message, 'You', true);
                chatInput.value = '';
            }
        };

        sendChatBtn?.addEventListener('click', sendMessage);
        chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    setupMessageHandling() {
        // Override WebRTC message handler to include our custom handling
        const originalHandler = this.webrtc.handleWebSocketMessage.bind(this.webrtc);
        
        this.webrtc.handleWebSocketMessage = async (message) => {
            // Call original handler first
            await originalHandler(message);
            
            // Handle additional message types
            const { type } = message;
            
            switch (type) {
                case 'user_joined':
                    this.handleUserJoined(message);
                    break;
                case 'user_left':
                    this.handleUserLeft(message);
                    break;
                case 'chat_message':
                    this.handleChatMessage(message);
                    break;
                case 'whiteboard_draw':
                    this.whiteboard.receiveStroke(message.data);
                    break;
                case 'whiteboard_clear':
                    this.whiteboard.receiveClear();
                    break;
                case 'whiteboard_state':
                    this.whiteboard.loadWhiteboardState(message.data);
                    break;
            }
        };
    }

    handleUserJoined(message) {
        const { user_id } = message;
        this.participants.add(user_id);
        this.updateParticipantCount();
        this.updateParticipantsList();
        this.showNotification(`${this.formatUserId(user_id)} joined the room`, 'info');
    }

    handleUserLeft(message) {
        const { user_id } = message;
        this.participants.delete(user_id);
        this.updateParticipantCount();
        this.updateParticipantsList();
        this.showNotification(`${this.formatUserId(user_id)} left the room`, 'info');
    }

    handleChatMessage(message) {
        const { message: text, user_id, timestamp } = message;
        this.addChatMessage(text, this.formatUserId(user_id), false, timestamp);
    }

    addChatMessage(text, sender, isOwn = false, timestamp = null) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;

        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${isOwn ? 'own' : ''}`;
        
        const time = timestamp ? new Date(timestamp) : new Date();
        const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageEl.innerHTML = `
            <div class="chat-message-header">${sender} • ${timeStr}</div>
            <div class="chat-message-text">${this.escapeHtml(text)}</div>
        `;

        chatMessages.appendChild(messageEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Show notification if chat is not active tab
        if (this.currentTab !== 'chat' && !isOwn) {
            this.showChatNotification();
        }
    }

    showChatNotification() {
        const chatTabBtn = document.querySelector('.tab-btn[data-tab="chat"]');
        if (chatTabBtn && !chatTabBtn.classList.contains('active')) {
            chatTabBtn.style.background = '#ef4444';
            chatTabBtn.style.color = 'white';
            
            // Remove notification when tab is clicked
            setTimeout(() => {
                if (!chatTabBtn.classList.contains('active')) {
                    chatTabBtn.style.background = '';
                    chatTabBtn.style.color = '';
                }
            }, 5000);
        }
    }

    switchTab(tabName) {
        this.currentTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = '';
            btn.style.color = '';
        });
        document.querySelector(`.tab-btn[data-tab="${tabName}"]`)?.classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`)?.classList.add('active');

        // Special handling for whiteboard - wait for tab to be visible
        if (tabName === 'whiteboard' && this.whiteboard) {
            // Use requestAnimationFrame to ensure the tab is fully rendered
            requestAnimationFrame(() => {
                setTimeout(() => {
                    // Check if the whiteboard container is visible and has dimensions
                    const whiteboardContainer = document.querySelector('.whiteboard-container');
                    if (whiteboardContainer && whiteboardContainer.offsetWidth > 0) {
                        this.whiteboard.resizeCanvas();
                    }
                }, 100);
            });
        }
    }

    toggleVideo() {
        if (this.webrtc) {
            const isEnabled = this.webrtc.toggleVideo();
            this.updateVideoButton(isEnabled);
        }
    }

    toggleAudio() {
        if (this.webrtc) {
            const isEnabled = this.webrtc.toggleAudio();
            this.updateAudioButton(isEnabled);
        }
    }

    updateVideoButton(isEnabled) {
        const buttons = [
            document.getElementById('toggleVideoBtn'),
            document.getElementById('toggleVideoMainBtn')
        ];
        
        buttons.forEach(btn => {
            if (btn) {
                btn.classList.toggle('active', isEnabled);
                btn.classList.toggle('inactive', !isEnabled);
                btn.title = isEnabled ? 'Turn off camera' : 'Turn on camera';
            }
        });
    }

    updateAudioButton(isEnabled) {
        const buttons = [
            document.getElementById('toggleAudioBtn'),
            document.getElementById('toggleAudioMainBtn')
        ];
        
        buttons.forEach(btn => {
            if (btn) {
                btn.classList.toggle('active', isEnabled);
                btn.classList.toggle('inactive', !isEnabled);
                btn.title = isEnabled ? 'Mute microphone' : 'Unmute microphone';
            }
        });
    }

    enterWhiteboardFullscreen() {
        if (this.whiteboard) {
            this.whiteboard.enterFullscreen();
            this.showNotification('Press ESC to exit fullscreen', 'info');
        }
    }

    exitWhiteboardFullscreen() {
        if (this.whiteboard) {
            this.whiteboard.exitFullscreen();
        }
    }

    exitVideoFullscreen() {
        if (this.webrtc) {
            this.webrtc.exitVideoFullscreen();
        }
    }

    async enablePictureInPicture() {
        if (this.webrtc) {
            await this.webrtc.enablePictureInPicture();
            this.showNotification('Picture-in-Picture enabled', 'success');
        }
    }

    expandFromPiP() {
        const pipContainer = document.getElementById('pipContainer');
        const pipVideo = document.getElementById('pipVideo');
        
        if (pipVideo && pipVideo.srcObject) {
            // Get the user ID from the PiP video source
            const userId = pipContainer.dataset.userId || 'unknown';
            this.webrtc.enterVideoFullscreen(pipVideo, userId);
            this.closePictureInPicture();
        }
    }

    closePictureInPicture() {
        if (this.webrtc) {
            this.webrtc.closePictureInPicture();
        }
    }

    exitAllFullscreenModes() {
        // Exit video fullscreen
        const videoFullscreen = document.getElementById('fullscreenOverlay');
        if (videoFullscreen && videoFullscreen.classList.contains('active')) {
            this.exitVideoFullscreen();
        }

        // Exit whiteboard fullscreen
        const whiteboardFullscreen = document.getElementById('whiteboardFullscreen');
        if (whiteboardFullscreen && whiteboardFullscreen.classList.contains('active')) {
            this.exitWhiteboardFullscreen();
        }
    }

    async toggleScreenShare() {
        if (this.webrtc) {
            const shareBtn = document.getElementById('shareScreenBtn');
            const indicator = document.getElementById('screenShareIndicator');
            
            if (this.webrtc.isScreenSharing) {
                await this.webrtc.stopScreenShare();
                shareBtn?.classList.remove('active');
                indicator?.classList.remove('active');
                shareBtn.title = 'Share screen';
                this.showNotification('Screen sharing stopped', 'info');
            } else {
                const success = await this.webrtc.startScreenShare();
                if (success) {
                    shareBtn?.classList.add('active');
                    indicator?.classList.add('active');
                    shareBtn.title = 'Stop sharing';
                    this.showNotification('Screen sharing started', 'success');
                } else {
                    this.showNotification('Failed to start screen sharing', 'error');
                }
            }
        }
    }

    updateParticipantCount() {
        const countEl = document.getElementById('participantCount');
        if (countEl) {
            const count = this.participants.size + 1; // +1 for self
            countEl.textContent = `${count} participant${count !== 1 ? 's' : ''}`;
        }
    }

    updateParticipantsList() {
        const listEl = document.getElementById('participantsList');
        if (!listEl) return;

        listEl.innerHTML = `
            <div class="participant-item">
                <div class="participant-avatar">👤</div>
                <div class="participant-info">
                    <span class="participant-name">You</span>
                    <span class="participant-status">Host</span>
                </div>
            </div>
        `;

        this.participants.forEach(userId => {
            const participantEl = document.createElement('div');
            participantEl.className = 'participant-item';
            participantEl.innerHTML = `
                <div class="participant-avatar">👤</div>
                <div class="participant-info">
                    <span class="participant-name">${this.formatUserId(userId)}</span>
                    <span class="participant-status">Participant</span>
                </div>
            `;
            listEl.appendChild(participantEl);
        });
    }

    formatUserId(userId) {
        return userId.replace('user_', '').substring(0, 8);
    }

    copyRoomLink() {
        const link = window.location.href;
        navigator.clipboard.writeText(link).then(() => {
            this.showNotification('Room link copied to clipboard!', 'success');
        }).catch(() => {
            this.showNotification('Failed to copy link', 'error');
        });
    }

    leaveRoom() {
        if (confirm('Are you sure you want to leave the room?')) {
            this.cleanup();
            window.location.href = '/';
        }
    }

    async initSettings() {
        try {
            const devices = await this.webrtc.getAvailableDevices();
            this.populateDeviceSelects(devices);
        } catch (error) {
            console.error('Failed to load device settings:', error);
        }
    }

    populateDeviceSelects(devices) {
        const cameraSelect = document.getElementById('cameraSelect');
        const microphoneSelect = document.getElementById('microphoneSelect');
        const speakerSelect = document.getElementById('speakerSelect');

        if (cameraSelect) {
            cameraSelect.innerHTML = '';
            devices.cameras.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Camera ${device.deviceId.substring(0, 8)}`;
                cameraSelect.appendChild(option);
            });
            
            cameraSelect.addEventListener('change', (e) => {
                this.webrtc.switchCamera(e.target.value);
            });
        }

        if (microphoneSelect) {
            microphoneSelect.innerHTML = '';
            devices.microphones.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${device.deviceId.substring(0, 8)}`;
                microphoneSelect.appendChild(option);
            });
        }

        if (speakerSelect) {
            speakerSelect.innerHTML = '';
            devices.speakers.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Speaker ${device.deviceId.substring(0, 8)}`;
                speakerSelect.appendChild(option);
            });
        }
    }

    openSettings() {
        const modal = document.getElementById('settingsModal');
        modal?.classList.add('show');
    }

    closeSettings() {
        const modal = document.getElementById('settingsModal');
        modal?.classList.remove('show');
    }

    initConnectionStatus() {
        this.updateConnectionStatus('websocket', 'connecting');
        this.detectNetworkType();
        
        // Monitor WebSocket connection
        if (this.webrtc && this.webrtc.websocket) {
            this.webrtc.websocket.addEventListener('open', () => {
                this.updateConnectionStatus('websocket', 'connected');
            });
            
            this.webrtc.websocket.addEventListener('close', () => {
                this.updateConnectionStatus('websocket', 'disconnected');
            });
            
            this.webrtc.websocket.addEventListener('error', () => {
                this.updateConnectionStatus('websocket', 'disconnected');
            });
        }
    }

    async detectNetworkType() {
        try {
            if ('connection' in navigator) {
                const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                if (connection) {
                    this.updateConnectionStatus('network', connection.effectiveType || 'unknown');
                    
                    connection.addEventListener('change', () => {
                        this.updateConnectionStatus('network', connection.effectiveType || 'unknown');
                    });
                }
            }
            
            // Fallback: Test connection speed
            const startTime = Date.now();
            await fetch('/static/images/test.png?' + Math.random()).catch(() => {});
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            let networkType = 'unknown';
            if (duration < 100) networkType = 'fast';
            else if (duration < 300) networkType = 'medium';
            else networkType = 'slow';
            
            this.updateConnectionStatus('network', networkType);
        } catch (error) {
            console.warn('Network detection failed:', error);
            this.updateConnectionStatus('network', 'unknown');
        }
    }

    async testConnection() {
        const btn = document.getElementById('connectionTestBtn');
        btn.textContent = 'Testing...';
        btn.disabled = true;

        try {
            // Test media access
            this.updateConnectionStatus('media', 'connecting');
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: true, 
                    audio: true 
                });
                stream.getTracks().forEach(track => track.stop());
                this.updateConnectionStatus('media', 'connected');
            } catch (mediaError) {
                console.warn('Media access test failed:', mediaError);
                this.updateConnectionStatus('media', 'disconnected');
            }

            // Test WebSocket connection
            if (this.webrtc && this.webrtc.websocket) {
                if (this.webrtc.websocket.readyState === WebSocket.OPEN) {
                    this.updateConnectionStatus('websocket', 'connected');
                } else {
                    this.updateConnectionStatus('websocket', 'disconnected');
                }
            }

            // Test STUN/TURN connectivity
            await this.testSTUNConnectivity();

            this.showNotification('Connection test completed', 'success');
        } catch (error) {
            console.error('Connection test failed:', error);
            this.showNotification('Connection test failed: ' + error.message, 'error');
        } finally {
            btn.textContent = 'Test Connection';
            btn.disabled = false;
        }
    }

    async testSTUNConnectivity() {
        return new Promise((resolve) => {
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    pc.close();
                    console.warn('STUN connectivity test timed out');
                    resolve(false);
                }
            }, 5000);

            pc.onicecandidate = (event) => {
                if (event.candidate && event.candidate.candidate.includes('srflx')) {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        pc.close();
                        console.log('STUN connectivity test successful');
                        resolve(true);
                    }
                }
            };

            pc.createDataChannel('test');
            pc.createOffer().then(offer => pc.setLocalDescription(offer));
        });
    }

    updateConnectionStatus(type, status) {
        this.connectionStatus[type] = status;
        
        const statusElement = document.getElementById(`${type === 'websocket' ? 'ws' : type}Status`);
        if (statusElement) {
            statusElement.textContent = this.formatStatusText(status);
            statusElement.className = `status-indicator ${this.getStatusClass(status)}`;
        }
    }

    formatStatusText(status) {
        const statusMap = {
            'connected': 'Connected',
            'connecting': 'Connecting...',
            'disconnected': 'Disconnected',
            'not-tested': 'Not tested',
            'unknown': 'Unknown',
            'fast': 'Fast',
            'medium': 'Medium',
            'slow': 'Slow',
            '4g': '4G',
            '3g': '3G',
            '2g': '2G',
            'wifi': 'WiFi'
        };
        return statusMap[status] || status;
    }

    getStatusClass(status) {
        if (['connected', 'fast', '4g', 'wifi'].includes(status)) {
            return 'connected';
        } else if (['connecting', 'medium', '3g'].includes(status)) {
            return 'connecting';
        } else if (['disconnected', 'slow', '2g'].includes(status)) {
            return 'disconnected';
        }
        return 'unknown';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">&times;</button>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);

        // Add notification styles if not already present
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 15px 20px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    max-width: 400px;
                    animation: slideIn 0.3s ease;
                }
                
                .notification-error {
                    border-left: 4px solid #ef4444;
                    background: #fef2f2;
                }
                
                .notification-success {
                    border-left: 4px solid #10b981;
                    background: #f0fdf4;
                }
                
                .notification-info {
                    border-left: 4px solid #2563eb;
                    background: #eff6ff;
                }
                
                .notification button {
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    color: #64748b;
                    margin-left: auto;
                }
                
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }
    }

    cleanup() {
        if (this.webrtc) {
            this.webrtc.disconnect();
        }
        
        console.log('Room cleanup completed');
    }
}

// Initialize the room when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    window.roomManager = new RoomManager();
    await window.roomManager.init();
});