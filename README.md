# 🎥 Professional Video Call Application

A full-featured, open-source web-based video calling application built with Python FastAPI and WebRTC. Perfect for personal use, remote meetings, and showcasing in your portfolio.

## ✨ Features

### 🎬 Video & Audio
- **HD Video Calls** - High-definition video with adaptive quality (480p to 1080p)
- **Crystal Clear Audio** - Echo cancellation, noise suppression, and auto gain control
- **Multiple Participants** - Support for multi-party video conferences
- **Camera/Microphone Controls** - Easy toggle on/off with visual feedback

### 🖥️ Screen Sharing
- **Full Screen Sharing** - Share your entire screen or specific applications
- **Audio Sharing** - Include system audio in screen shares
- **Real-time Switching** - Switch between camera and screen sharing seamlessly

### 🎨 Interactive Whiteboard
- **Collaborative Drawing** - Real-time collaborative whiteboard
- **Drawing Tools** - Pen, eraser, color picker, and brush size controls
- **Multi-user Support** - Multiple users can draw simultaneously
- **Persistent State** - Whiteboard content is preserved during the session

### 💬 Real-time Chat
- **Instant Messaging** - Built-in chat with timestamps
- **User Identification** - Clear sender identification
- **Notification System** - Visual notifications for new messages

### ⚙️ Advanced Features
- **Device Management** - Switch between cameras, microphones, and speakers
- **Keyboard Shortcuts** - Quick access to common functions
- **Responsive Design** - Works on desktop, tablet, and mobile devices
- **Connection Status** - Real-time connection quality indicators
- **Auto-reconnection** - Automatic reconnection on network issues

## 🚀 Quick Start

### Prerequisites
- Python 3.8 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Camera and microphone (for video calls)

### Installation

1. **Clone or download the repository**
```bash
git clone <your-repo-url>
cd call
```

2. **Create and activate virtual environment**
```bash
python -m venv .venv

# On Linux/Mac:
source .venv/bin/activate

# On Windows:
.venv\Scripts\activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Run the application**
```bash
python main.py
```

5. **Open your browser**
Navigate to `http://localhost:8000`

> **Important**: Use `localhost` (not `127.0.0.1`) to avoid camera/microphone permission issues in browsers.

## 🎯 Usage Guide

### Starting a Video Call

1. **Home Page**: Visit `http://localhost:8000`
2. **Create Room**: Enter a room name or leave blank for auto-generation
3. **Join Room**: Click "Join Room" button
4. **Grant Permissions**: Allow camera and microphone access when prompted
5. **Share Link**: Copy the room link to invite others

### During a Call

#### Video Controls
- **Toggle Camera**: Click camera button or press `V`
- **Toggle Microphone**: Click microphone button or press `M`
- **Screen Share**: Click screen share button or press `Ctrl/Cmd + S`

#### Chat & Collaboration
- **Send Message**: Type in chat and press Enter
- **Switch to Whiteboard**: Click whiteboard tab or press `W`
- **Draw on Whiteboard**: Select pen tool and draw
- **Change Colors**: Use color picker for different colors
- **Clear Whiteboard**: Click clear button to reset

#### Settings
- **Device Settings**: Click settings gear to change camera/microphone
- **Video Quality**: Adjust video quality (480p/720p/1080p)
- **Audio Settings**: Configure microphone and speaker devices

### Keyboard Shortcuts
- `M` - Toggle microphone
- `V` - Toggle camera
- `Ctrl/Cmd + S` - Toggle screen sharing
- `C` - Switch to chat tab
- `W` - Switch to whiteboard tab
- `P` - Switch to participants tab

## 🏗️ Technical Architecture

### Backend (Python)
- **FastAPI** - Modern, fast web framework
- **WebSockets** - Real-time bidirectional communication
- **AsyncIO** - Asynchronous request handling
- **Uvicorn** - ASGI server with auto-reload

### Frontend (JavaScript)
- **WebRTC** - Peer-to-peer video/audio communication
- **Canvas API** - Whiteboard drawing functionality
- **Modern ES6+** - Clean, modular JavaScript code
- **Responsive CSS** - Mobile-first design approach

### Key Components
```
├── main.py                 # FastAPI application & WebSocket handlers
├── templates/              # HTML templates
│   ├── index.html         # Home page
│   └── room.html          # Video call interface
├── static/
│   ├── css/               # Stylesheets
│   │   ├── style.css      # Main styles
│   │   └── room.css       # Room-specific styles
│   └── js/                # JavaScript modules
│       ├── webrtc.js      # WebRTC functionality
│       ├── whiteboard.js  # Whiteboard features
│       ├── room.js        # Room management
│       └── home.js        # Home page logic
└── requirements.txt       # Python dependencies
```

## 🔧 Configuration

### Environment Variables
```bash
# Optional: Set custom host/port
export HOST=0.0.0.0
export PORT=8000

# Optional: Enable debug mode
export DEBUG=true
```

### Video Quality Settings
Modify `webrtc.js` to adjust default video constraints:
```javascript
this.constraints = {
    video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
    }
};
```

## 🌐 Deployment

### Production Deployment

1. **Install production dependencies**
```bash
pip install gunicorn
```

2. **Run with Gunicorn**
```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

3. **HTTPS Setup** (Required for production)
- WebRTC requires HTTPS in production
- Use nginx or Apache as reverse proxy
- Obtain SSL certificate (Let's Encrypt recommended)

### Docker Deployment
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 8000

CMD ["python", "main.py"]
```

## 🔒 Security Considerations

### Development
- Camera/microphone access requires `localhost` or HTTPS
- WebSocket connections are not encrypted in development

### Production
- **HTTPS Required** - WebRTC mandates HTTPS for media access
- **STUN/TURN Servers** - Configure for NAT traversal
- **Rate Limiting** - Implement to prevent abuse
- **Authentication** - Add user authentication for private rooms

## 🧪 Testing

### Manual Testing
1. Open multiple browser tabs to simulate different users
2. Test video/audio functionality
3. Verify screen sharing works
4. Test whiteboard collaboration
5. Check chat messaging

### Browser Compatibility
- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+

## 🚨 Troubleshooting

### Common Issues

**Camera/Microphone Permission Denied**
- Solution: Use `http://localhost:8000` (not 127.0.0.1)
- Ensure browser permissions are granted
- Try refreshing the page

**Video/Audio Not Working**
- Check browser console for errors
- Verify camera/microphone are not used by other applications
- Test with different browsers

**Screen Sharing Failed**
- Screen sharing requires recent browser versions
- Some browsers need additional permissions
- Check if screen capture is blocked by antivirus

**WebSocket Connection Issues**
- Check server is running on correct port
- Verify firewall settings
- Look for proxy/network restrictions

### Debug Mode
Enable verbose logging by modifying `main.py`:
```python
logging.basicConfig(level=logging.DEBUG)
```

## 🤝 Contributing

This is an open-source project perfect for:
- Adding new features
- Improving UI/UX
- Optimizing performance
- Adding security features
- Writing documentation

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.

## 🎯 Portfolio Use

This project demonstrates:
- **Full-stack Development** - Python backend + JavaScript frontend
- **Real-time Communication** - WebRTC and WebSocket implementation
- **Modern Web Technologies** - FastAPI, async/await, ES6+
- **User Experience Design** - Responsive, accessible interface
- **Code Quality** - Clean, documented, modular code
- **Problem Solving** - Complex real-time application challenges

Perfect for showcasing in your developer portfolio!

## 📞 Support

For issues, questions, or contributions:
- Check the troubleshooting section
- Review browser console for errors
- Test with different devices/browsers
- Ensure all dependencies are installed correctly

---

**Built with ❤️ using Python FastAPI and WebRTC**

*Professional video calling made simple and open source.*