// Whiteboard functionality for collaborative drawing
class WhiteboardManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.isDrawing = false;
        this.currentTool = 'pen';
        this.currentColor = '#000000';
        this.currentSize = 3;
        this.lastX = 0;
        this.lastY = 0;
        this.websocket = null;
        this.strokes = [];
    }

    init(websocket) {
        this.websocket = websocket;
        this.canvas = document.getElementById('whiteboardCanvas');
        
        if (!this.canvas) {
            console.error('Whiteboard canvas not found');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
        this.bindEvents();
        
        console.log('Whiteboard initialized');
    }

    setupCanvas() {
        // Set canvas size to match container
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight - 60; // Account for toolbar
        
        // Set default drawing properties
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentSize;
        
        // Handle resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight - 60;
        
        this.ctx.putImageData(imageData, 0, 0);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    bindEvents() {
        // Tool selection
        const penTool = document.getElementById('penTool');
        const eraserTool = document.getElementById('eraserTool');
        const colorPicker = document.getElementById('colorPicker');
        const brushSize = document.getElementById('brushSize');
        const clearButton = document.getElementById('clearWhiteboard');

        if (penTool) {
            penTool.addEventListener('click', () => this.selectTool('pen'));
        }
        
        if (eraserTool) {
            eraserTool.addEventListener('click', () => this.selectTool('eraser'));
        }
        
        if (colorPicker) {
            colorPicker.addEventListener('change', (e) => this.setColor(e.target.value));
        }
        
        if (brushSize) {
            brushSize.addEventListener('input', (e) => this.setBrushSize(e.target.value));
        }
        
        if (clearButton) {
            clearButton.addEventListener('click', () => this.clearCanvas());
        }

        // Drawing events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.canvas.dispatchEvent(mouseEvent);
        });
    }

    selectTool(tool) {
        this.currentTool = tool;
        
        // Update UI
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (tool === 'pen') {
            document.getElementById('penTool')?.classList.add('active');
            this.canvas.style.cursor = 'crosshair';
        } else if (tool === 'eraser') {
            document.getElementById('eraserTool')?.classList.add('active');
            this.canvas.style.cursor = 'grab';
        }
    }

    setColor(color) {
        this.currentColor = color;
        this.ctx.strokeStyle = color;
    }

    setBrushSize(size) {
        this.currentSize = size;
        this.ctx.lineWidth = size;
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    startDrawing(e) {
        this.isDrawing = true;
        const pos = this.getMousePos(e);
        this.lastX = pos.x;
        this.lastY = pos.y;

        // Start new stroke
        this.currentStroke = {
            tool: this.currentTool,
            color: this.currentColor,
            size: this.currentSize,
            points: [{ x: pos.x, y: pos.y }]
        };
    }

    draw(e) {
        if (!this.isDrawing) return;

        const pos = this.getMousePos(e);
        
        // Add point to current stroke
        this.currentStroke.points.push({ x: pos.x, y: pos.y });

        // Draw locally
        this.drawLine(this.lastX, this.lastY, pos.x, pos.y);

        this.lastX = pos.x;
        this.lastY = pos.y;
    }

    stopDrawing() {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;

        // Send stroke to other users
        if (this.currentStroke && this.websocket) {
            this.sendStroke(this.currentStroke);
        }

        this.currentStroke = null;
    }

    drawLine(x1, y1, x2, y2) {
        this.ctx.save();
        
        if (this.currentTool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.lineWidth = this.currentSize * 2; // Make eraser bigger
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = this.currentColor;
            this.ctx.lineWidth = this.currentSize;
        }

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    drawStroke(stroke) {
        if (!stroke.points || stroke.points.length < 2) return;

        this.ctx.save();
        
        if (stroke.tool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.lineWidth = stroke.size * 2;
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = stroke.color;
            this.ctx.lineWidth = stroke.size;
        }

        this.ctx.beginPath();
        this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        
        for (let i = 1; i < stroke.points.length; i++) {
            this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        
        this.ctx.stroke();
        this.ctx.restore();
    }

    sendStroke(stroke) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'whiteboard_draw',
                data: stroke
            }));
        }
    }

    receiveStroke(strokeData) {
        this.strokes.push(strokeData);
        this.drawStroke(strokeData);
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.strokes = [];
        
        // Send clear command to other users
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'whiteboard_clear'
            }));
        }
    }

    receiveClear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.strokes = [];
    }

    loadWhiteboardState(strokes) {
        this.strokes = strokes || [];
        this.redrawCanvas();
    }

    redrawCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (const stroke of this.strokes) {
            this.drawStroke(stroke);
        }
    }

    exportCanvas() {
        return this.canvas.toDataURL('image/png');
    }

    importCanvas(dataUrl) {
        const img = new Image();
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
        img.src = dataUrl;
    }

    // Utility methods for advanced features
    addText(text, x, y, font = '16px Arial', color = '#000000') {
        this.ctx.save();
        this.ctx.font = font;
        this.ctx.fillStyle = color;
        this.ctx.fillText(text, x, y);
        this.ctx.restore();
    }

    addShape(type, startX, startY, endX, endY, options = {}) {
        this.ctx.save();
        
        this.ctx.strokeStyle = options.color || this.currentColor;
        this.ctx.lineWidth = options.size || this.currentSize;
        
        this.ctx.beginPath();
        
        switch (type) {
            case 'rectangle':
                this.ctx.rect(startX, startY, endX - startX, endY - startY);
                break;
            case 'circle':
                const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                this.ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
                break;
            case 'line':
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                break;
        }
        
        if (options.fill) {
            this.ctx.fillStyle = options.fillColor || options.color || this.currentColor;
            this.ctx.fill();
        } else {
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }

    // Collaboration features
    addPointer(userId, x, y) {
        const pointer = document.getElementById(`pointer-${userId}`);
        
        if (pointer) {
            pointer.style.left = x + 'px';
            pointer.style.top = y + 'px';
        } else {
            this.createPointer(userId, x, y);
        }
    }

    createPointer(userId, x, y) {
        const pointer = document.createElement('div');
        pointer.id = `pointer-${userId}`;
        pointer.className = 'user-pointer';
        pointer.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            width: 12px;
            height: 12px;
            background: #ff4444;
            border-radius: 50%;
            pointer-events: none;
            z-index: 1000;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        `;
        
        this.canvas.parentElement.appendChild(pointer);
        
        // Remove pointer after 5 seconds of inactivity
        setTimeout(() => {
            const existingPointer = document.getElementById(`pointer-${userId}`);
            if (existingPointer) {
                existingPointer.remove();
            }
        }, 5000);
    }

    removePointer(userId) {
        const pointer = document.getElementById(`pointer-${userId}`);
        if (pointer) {
            pointer.remove();
        }
    }
}

// Export for use in other modules
window.WhiteboardManager = WhiteboardManager;