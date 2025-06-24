// Home page functionality
class VideoCallApp {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadActiveRooms();
        
        // Auto-refresh active rooms every 30 seconds
        setInterval(() => this.loadActiveRooms(), 30000);
    }

    bindEvents() {
        const joinBtn = document.getElementById('joinBtn');
        const roomIdInput = document.getElementById('roomId');

        joinBtn.addEventListener('click', () => this.joinRoom());
        
        roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinRoom();
            }
        });
    }

    async joinRoom() {
        const roomIdInput = document.getElementById('roomId');
        let roomId = roomIdInput.value.trim();

        // Generate random room ID if none provided
        if (!roomId) {
            roomId = this.generateRoomId();
        }

        // Validate room ID format
        if (!this.isValidRoomId(roomId)) {
            this.showNotification('Please enter a valid room ID (letters, numbers, and hyphens only)', 'error');
            return;
        }

        // Navigate to room
        window.location.href = `/room/${roomId}`;
    }

    generateRoomId() {
        const adjectives = ['quick', 'bright', 'swift', 'smart', 'cool', 'fast', 'neat', 'clean', 'sharp', 'fresh'];
        const nouns = ['meeting', 'call', 'session', 'room', 'space', 'chat', 'talk', 'sync', 'hub', 'zone'];
        
        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const number = Math.floor(Math.random() * 1000);
        
        return `${adjective}-${noun}-${number}`;
    }

    isValidRoomId(roomId) {
        // Allow letters, numbers, and hyphens, 3-50 characters
        const regex = /^[a-zA-Z0-9-]{3,50}$/;
        return regex.test(roomId);
    }

    async loadActiveRooms() {
        try {
            const response = await fetch('/api/rooms');
            const rooms = await response.json();
            
            await this.displayActiveRooms(rooms);
        } catch (error) {
            console.error('Failed to load active rooms:', error);
        }
    }

    async displayActiveRooms(rooms) {
        const roomsList = document.getElementById('roomsList');
        
        if (rooms.length === 0) {
            roomsList.innerHTML = '<p class="no-rooms">No active rooms</p>';
            return;
        }

        // Get participant counts for each room
        const roomsWithCounts = await Promise.all(
            rooms.map(async (roomId) => {
                try {
                    const response = await fetch(`/api/room/${roomId}/users`);
                    const data = await response.json();
                    return { roomId, count: data.count };
                } catch (error) {
                    return { roomId, count: 0 };
                }
            })
        );

        roomsList.innerHTML = roomsWithCounts.map(room => `
            <div class="room-item">
                <div class="room-info">
                    <div class="room-id">${room.roomId}</div>
                    <div class="room-participants">${room.count} participant${room.count !== 1 ? 's' : ''}</div>
                </div>
                <button class="btn btn-primary" onclick="app.joinSpecificRoom('${room.roomId}')">
                    Join
                </button>
            </div>
        `).join('');
    }

    joinSpecificRoom(roomId) {
        window.location.href = `/room/${roomId}`;
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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VideoCallApp();
});