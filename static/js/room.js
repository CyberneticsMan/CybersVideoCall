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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // Window events
        window.addEventListener('beforeunload', () => this.cleanup());
        window.addEventListener('resize', () => this.handleResize());
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

        // Special handling for whiteboard
        if (tabName === 'whiteboard' && this.whiteboard) {
            setTimeout(() => this.whiteboard.resizeCanvas(), 100);
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

    async toggleScreenShare() {
        if (this.webrtc) {
            const shareBtn = document.getElementById('shareScreenBtn');
            
            if (this.webrtc.isScreenSharing) {
                await this.webrtc.stopScreenShare();
                shareBtn?.classList.remove('active');
                shareBtn.title = 'Share screen';
            } else {
                const success = await this.webrtc.startScreenShare();
                if (success) {
                    shareBtn?.classList.add('active');
                    shareBtn.title = 'Stop sharing';
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

    handleKeyboardShortcuts(e) {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'm':
                e.preventDefault();
                this.toggleAudio();
                break;
            case 'v':
                e.preventDefault();
                this.toggleVideo();
                break;
            case 's':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.toggleScreenShare();
                }
                break;
            case 'c':
                e.preventDefault();
                this.switchTab('chat');
                break;
            case 'w':
                e.preventDefault();
                this.switchTab('whiteboard');
                break;
            case 'p':
                e.preventDefault();
                this.switchTab('participants');
                break;
        }
    }

    handleResize() {
        if (this.whiteboard && this.currentTab === 'whiteboard') {
            this.whiteboard.resizeCanvas();
        }
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