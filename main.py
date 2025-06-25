"""
Professional Video Call Application
A full-featured web-based video calling application with voice, video, screen sharing, and whiteboard features.
Optimized for performance and built with clean, maintainable code.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import json
import uuid
import asyncio
from typing import Dict, List, Set
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Professional Video Call App",
    description="Full-featured video calling application with screen sharing and whiteboard",
    version="1.0.0"
)

# Templates and static files
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")


class ConnectionManager:
    """Manages WebSocket connections for real-time communication"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.rooms: Dict[str, Set[str]] = {}
        self.user_rooms: Dict[str, str] = {}
        # Add heartbeat tracking
        self.heartbeats: Dict[str, float] = {}
        self.start_heartbeat_monitor()
    
    def start_heartbeat_monitor(self):
        """Start monitoring heartbeats to detect dead connections"""
        import asyncio
        import time
        
        async def heartbeat_monitor():
            while True:
                await asyncio.sleep(30)  # Check every 30 seconds
                current_time = time.time()
                dead_connections = []
                
                for user_id, last_heartbeat in self.heartbeats.items():
                    if current_time - last_heartbeat > 60:  # 60 seconds timeout
                        dead_connections.append(user_id)
                
                for user_id in dead_connections:
                    logger.info(f"Cleaning up dead connection for user {user_id}")
                    self.disconnect(user_id)
        
        asyncio.create_task(heartbeat_monitor())
    
    async def connect(self, websocket: WebSocket, user_id: str):
        """Connect a new user"""
        # If user already exists, disconnect old connection first
        if user_id in self.active_connections:
            logger.info(f"User {user_id} reconnecting, cleaning up old connection")
            await self.force_disconnect(user_id)
        
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.heartbeats[user_id] = time.time()
        logger.info(f"User {user_id} connected")
    
    async def force_disconnect(self, user_id: str):
        """Force disconnect a user and notify others"""
        if user_id in self.active_connections:
            try:
                old_websocket = self.active_connections[user_id]
                await old_websocket.close()
            except:
                pass  # Connection might already be dead
        
        # Clean up and notify others
        if user_id in self.user_rooms:
            room_id = self.user_rooms[user_id]
            await self.broadcast_to_room(room_id, {
                "type": "user_left",
                "user_id": user_id,
                "timestamp": datetime.now().isoformat()
            }, exclude_user=user_id)
        
        self.disconnect(user_id)
    
    def disconnect(self, user_id: str):
        """Disconnect a user and clean up"""
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        
        if user_id in self.heartbeats:
            del self.heartbeats[user_id]
        
        # Remove from room
        if user_id in self.user_rooms:
            room_id = self.user_rooms[user_id]
            if room_id in self.rooms:
                self.rooms[room_id].discard(user_id)
                if not self.rooms[room_id]:
                    del self.rooms[room_id]
            del self.user_rooms[user_id]
        
        logger.info(f"User {user_id} disconnected")

    def update_heartbeat(self, user_id: str):
        """Update heartbeat timestamp for a user"""
        import time
        self.heartbeats[user_id] = time.time()

    async def join_room(self, user_id: str, room_id: str):
        """Add user to a room"""
        if room_id not in self.rooms:
            self.rooms[room_id] = set()
        
        self.rooms[room_id].add(user_id)
        self.user_rooms[user_id] = room_id
        
        # Notify other users in the room
        await self.broadcast_to_room(room_id, {
            "type": "user_joined",
            "user_id": user_id,
            "timestamp": datetime.now().isoformat()
        }, exclude_user=user_id)
        
        logger.info(f"User {user_id} joined room {room_id}")
    
    async def leave_room(self, user_id: str):
        """Remove user from their current room"""
        if user_id in self.user_rooms:
            room_id = self.user_rooms[user_id]
            
            # Notify other users
            await self.broadcast_to_room(room_id, {
                "type": "user_left",
                "user_id": user_id,
                "timestamp": datetime.now().isoformat()
            }, exclude_user=user_id)
            
            self.rooms[room_id].discard(user_id)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
            del self.user_rooms[user_id]
    
    async def send_to_user(self, user_id: str, message: dict):
        """Send message to specific user"""
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending message to {user_id}: {e}")
                self.disconnect(user_id)
    
    async def broadcast_to_room(self, room_id: str, message: dict, exclude_user: str = None):
        """Broadcast message to all users in a room"""
        if room_id in self.rooms:
            disconnected_users = []
            for user_id in self.rooms[room_id]:
                if user_id != exclude_user:
                    try:
                        await self.send_to_user(user_id, message)
                    except Exception as e:
                        logger.error(f"Error broadcasting to {user_id}: {e}")
                        disconnected_users.append(user_id)
            
            # Clean up disconnected users
            for user_id in disconnected_users:
                self.disconnect(user_id)


manager = ConnectionManager()


class WhiteboardManager:
    """Manages whiteboard state and operations"""
    
    def __init__(self):
        self.boards: Dict[str, List] = {}
    
    def get_board(self, room_id: str) -> List:
        """Get whiteboard data for a room"""
        return self.boards.get(room_id, [])
    
    def add_stroke(self, room_id: str, stroke_data: dict):
        """Add a new stroke to the whiteboard"""
        if room_id not in self.boards:
            self.boards[room_id] = []
        
        stroke_data['timestamp'] = datetime.now().isoformat()
        stroke_data['id'] = str(uuid.uuid4())
        self.boards[room_id].append(stroke_data)
    
    def clear_board(self, room_id: str):
        """Clear the whiteboard for a room"""
        self.boards[room_id] = []


whiteboard_manager = WhiteboardManager()


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Home page"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/room/{room_id}", response_class=HTMLResponse)
async def room(request: Request, room_id: str):
    """Room page for video calls"""
    return templates.TemplateResponse("room.html", {
        "request": request, 
        "room_id": room_id
    })


@app.get("/api/rooms", response_model=List[str])
async def get_active_rooms():
    """Get list of active rooms"""
    return list(manager.rooms.keys())


@app.get("/api/room/{room_id}/users")
async def get_room_users(room_id: str):
    """Get users in a specific room"""
    users = list(manager.rooms.get(room_id, set()))
    return {"room_id": room_id, "users": users, "count": len(users)}


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """WebSocket endpoint for real-time communication"""
    await manager.connect(websocket, user_id)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            message_type = message.get("type")
            
            if message_type == "join_room":
                room_id = message.get("room_id")
                await manager.join_room(user_id, room_id)
                
                # Send current whiteboard state
                board_data = whiteboard_manager.get_board(room_id)
                await manager.send_to_user(user_id, {
                    "type": "whiteboard_state",
                    "data": board_data
                })
            
            elif message_type == "leave_room":
                await manager.leave_room(user_id)
            
            elif message_type == "webrtc_offer":
                target_user = message.get("target_user")
                await manager.send_to_user(target_user, {
                    "type": "webrtc_offer",
                    "offer": message.get("offer"),
                    "sender": user_id
                })
            
            elif message_type == "webrtc_answer":
                target_user = message.get("target_user")
                await manager.send_to_user(target_user, {
                    "type": "webrtc_answer",
                    "answer": message.get("answer"),
                    "sender": user_id
                })
            
            elif message_type == "webrtc_ice_candidate":
                target_user = message.get("target_user")
                await manager.send_to_user(target_user, {
                    "type": "webrtc_ice_candidate",
                    "candidate": message.get("candidate"),
                    "sender": user_id
                })
            
            elif message_type == "screen_share_start":
                room_id = manager.user_rooms.get(user_id)
                if room_id:
                    await manager.broadcast_to_room(room_id, {
                        "type": "screen_share_start",
                        "user_id": user_id
                    }, exclude_user=user_id)
            
            elif message_type == "screen_share_stop":
                room_id = manager.user_rooms.get(user_id)
                if room_id:
                    await manager.broadcast_to_room(room_id, {
                        "type": "screen_share_stop",
                        "user_id": user_id
                    }, exclude_user=user_id)
            
            elif message_type == "whiteboard_draw":
                room_id = manager.user_rooms.get(user_id)
                if room_id:
                    stroke_data = message.get("data")
                    whiteboard_manager.add_stroke(room_id, stroke_data)
                    
                    await manager.broadcast_to_room(room_id, {
                        "type": "whiteboard_draw",
                        "data": stroke_data,
                        "user_id": user_id
                    }, exclude_user=user_id)
            
            elif message_type == "whiteboard_clear":
                room_id = manager.user_rooms.get(user_id)
                if room_id:
                    whiteboard_manager.clear_board(room_id)
                    
                    await manager.broadcast_to_room(room_id, {
                        "type": "whiteboard_clear",
                        "user_id": user_id
                    })
            
            elif message_type == "chat_message":
                room_id = manager.user_rooms.get(user_id)
                if room_id:
                    await manager.broadcast_to_room(room_id, {
                        "type": "chat_message",
                        "message": message.get("message"),
                        "user_id": user_id,
                        "timestamp": datetime.now().isoformat()
                    })
    
    except WebSocketDisconnect:
        manager.disconnect(user_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(user_id)


if __name__ == "__main__":
    import uvicorn
    import ssl
    import os
    
    # Create SSL context for HTTPS
    ssl_context = None
    
    # Check if SSL certificates exist
    cert_file = "cert.pem"
    key_file = "key.pem"
    
    if os.path.exists(cert_file) and os.path.exists(key_file):
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(cert_file, key_file)
        print("🔒 SSL certificates found - starting with HTTPS")
        server_url = "https://0.0.0.0:5000"
    else:
        print("⚠️  No SSL certificates found - starting with HTTP")
        print("   For production or testing WebRTC features, HTTPS is required")
        server_url = "http://0.0.0.0:5000"
    
    print("🎥 Professional Video Call App")
    print("================================")
    print(f"📍 Server starting on: {server_url}")
    print("")
    print("🔒 IMPORTANT: Camera/Microphone Access")
    print(f"   • Use {server_url}")
    print("   • Grant permissions when browser asks")
    print("   • If permissions fail, see troubleshooting below")
    print("")
    print("🚨 Troubleshooting Camera/Mic Issues:")
    print("   1. Ensure no other apps are using camera/mic")
    print("   2. Check browser permissions in settings")
    print("   3. Try incognito/private browsing mode")
    print("   4. Refresh the page and grant permissions again")
    print("")
    print("🌐 Browser-specific fixes:")
    print("   Chrome: chrome://settings/content/camera")
    print("   Firefox: about:preferences#privacy")
    print("   Safari: Safari > Preferences > Websites")
    print("")
    print("⚙️  Press Ctrl+C to stop the server")
    print("================================")
    
    # Run with or without SSL
    uvicorn.run(
        "main:app",
        host="0.0.0.0", 
        port=5000,  # Changed back to 5000 to match the printed URL
        log_level="info",
        reload=True,
        ssl_keyfile=key_file if ssl_context else None,
        ssl_certfile=cert_file if ssl_context else None
    )