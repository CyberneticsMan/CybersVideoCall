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
        this.initFullscreenWhiteboard();
        
        console.log('Whiteboard initialized');
    }

    initFullscreenWhiteboard() {
        this.fullscreenCanvas = document.getElementById('whiteboardFullscreenCanvas');
        if (this.fullscreenCanvas) {
            this.fullscreenCtx = this.fullscreenCanvas.getContext('2d');
            this.setupFullscreenCanvas();
            this.bindFullscreenEvents();
        }
    }

    setupCanvas() {
        // Set canvas size to match container
        const container = this.canvas.parentElement;
        if (!container) {
            console.warn('Canvas container not found, using default dimensions');
            this.canvas.width = 800;
            this.canvas.height = 600;
        } else {
            const containerWidth = container.clientWidth || 800;
            const containerHeight = Math.max(container.clientHeight - 60, 400); // Account for toolbar with minimum height
            
            this.canvas.width = containerWidth;
            this.canvas.height = containerHeight;
        }
        
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

    setupFullscreenCanvas() {
        if (!this.fullscreenCanvas) return;
        
        // Ensure we have valid viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight - 70; // Account for header
        
        if (viewportWidth <= 0 || viewportHeight <= 0) {
            console.warn('Invalid viewport dimensions, using fallback');
            this.fullscreenCanvas.width = 800;
            this.fullscreenCanvas.height = 600;
        } else {
            // Set canvas size to viewport
            this.fullscreenCanvas.width = viewportWidth;
            this.fullscreenCanvas.height = viewportHeight;
        }
        
        // Set drawing properties
        this.fullscreenCtx.lineCap = 'round';
        this.fullscreenCtx.lineJoin = 'round';
        this.fullscreenCtx.strokeStyle = this.currentColor;
        this.fullscreenCtx.lineWidth = this.currentSize;
        
        // Copy current whiteboard content only if main canvas has valid dimensions
        if (this.canvas && this.canvas.width > 0 && this.canvas.height > 0) {
            this.syncToFullscreen();
        }
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (!container) return;
        
        // Get current dimensions
        const containerWidth = container.clientWidth || 800;
        const containerHeight = Math.max(container.clientHeight - 60, 400); // Account for toolbar with minimum height
        
        // Don't resize if container has no dimensions yet
        if (containerWidth <= 0 || containerHeight <= 0) {
            console.log('Container not ready for resize, skipping...');
            return;
        }
        
        // Save current canvas content only if canvas has valid dimensions
        let imageData = null;
        if (this.canvas.width > 0 && this.canvas.height > 0) {
            try {
                imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            } catch (error) {
                console.warn('Could not save canvas content during resize:', error);
            }
        }
        
        // Set new dimensions
        this.canvas.width = containerWidth;
        this.canvas.height = containerHeight;
        
        // Restore canvas content if we had valid data
        if (imageData && imageData.width > 0 && imageData.height > 0) {
            try {
                this.ctx.putImageData(imageData, 0, 0);
            } catch (error) {
                console.warn('Could not restore canvas content after resize:', error);
                // Fallback: redraw from stored strokes
                this.redrawCanvas();
            }
        } else {
            // Redraw from stored strokes
            this.redrawCanvas();
        }
        
        // Restore drawing properties
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentSize;
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

        // Enhanced touch events for mobile with better handling
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        this.canvas.addEventListener('touchcancel', (e) => this.handleTouchEnd(e));

        // Prevent default touch behaviors
        this.canvas.addEventListener('touchstart', this.preventDefaultTouch, { passive: false });
        this.canvas.addEventListener('touchmove', this.preventDefaultTouch, { passive: false });
    }

    bindFullscreenEvents() {
        // Fullscreen tool selection
        const fullscreenPenTool = document.getElementById('fullscreenPenTool');
        const fullscreenEraserTool = document.getElementById('fullscreenEraserTool');
        const fullscreenColorPicker = document.getElementById('fullscreenColorPicker');
        const fullscreenBrushSize = document.getElementById('fullscreenBrushSize');
        const fullscreenClearButton = document.getElementById('fullscreenClearWhiteboard');

        if (fullscreenPenTool) {
            fullscreenPenTool.addEventListener('click', () => this.selectTool('pen'));
        }
        
        if (fullscreenEraserTool) {
            fullscreenEraserTool.addEventListener('click', () => this.selectTool('eraser'));
        }
        
        if (fullscreenColorPicker) {
            fullscreenColorPicker.addEventListener('change', (e) => this.setColor(e.target.value));
        }
        
        if (fullscreenBrushSize) {
            fullscreenBrushSize.addEventListener('input', (e) => this.setBrushSize(e.target.value));
        }
        
        if (fullscreenClearButton) {
            fullscreenClearButton.addEventListener('click', () => this.clearCanvas());
        }

        // Drawing events for fullscreen canvas
        this.fullscreenCanvas.addEventListener('mousedown', (e) => this.startDrawingFullscreen(e));
        this.fullscreenCanvas.addEventListener('mousemove', (e) => this.drawFullscreen(e));
        this.fullscreenCanvas.addEventListener('mouseup', () => this.stopDrawingFullscreen());
        this.fullscreenCanvas.addEventListener('mouseout', () => this.stopDrawingFullscreen());

        // Touch events for fullscreen canvas
        this.fullscreenCanvas.addEventListener('touchstart', (e) => this.handleFullscreenTouchStart(e));
        this.fullscreenCanvas.addEventListener('touchmove', (e) => this.handleFullscreenTouchMove(e));
        this.fullscreenCanvas.addEventListener('touchend', (e) => this.handleFullscreenTouchEnd(e));
        this.fullscreenCanvas.addEventListener('touchcancel', (e) => this.handleFullscreenTouchEnd(e));

        // Prevent default touch behaviors
        this.fullscreenCanvas.addEventListener('touchstart', this.preventDefaultTouch, { passive: false });
        this.fullscreenCanvas.addEventListener('touchmove', this.preventDefaultTouch, { passive: false });
    }

    preventDefaultTouch(e) {
        e.preventDefault();
    }

    handleTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.startDrawing(mouseEvent);
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1 && this.isDrawing) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.draw(mouseEvent);
        }
    }

    handleTouchEnd(e) {
        e.preventDefault();
        if (this.isDrawing) {
            this.stopDrawing();
        }
    }

    handleFullscreenTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.startDrawingFullscreen(mouseEvent);
        }
    }

    handleFullscreenTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1 && this.isDrawing) {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.drawFullscreen(mouseEvent);
        }
    }

    handleFullscreenTouchEnd(e) {
        e.preventDefault();
        if (this.isDrawing) {
            this.stopDrawingFullscreen();
        }
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

    startDrawingFullscreen(e) {
        this.isDrawing = true;
        const pos = this.getMousePosFullscreen(e);
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

    drawFullscreen(e) {
        if (!this.isDrawing) return;

        const pos = this.getMousePosFullscreen(e);
        
        // Add point to current stroke
        this.currentStroke.points.push({ x: pos.x, y: pos.y });

        // Draw on fullscreen canvas
        this.drawLineFullscreen(this.lastX, this.lastY, pos.x, pos.y);

        this.lastX = pos.x;
        this.lastY = pos.y;
    }

    stopDrawingFullscreen() {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;

        // Send stroke to other users
        if (this.currentStroke && this.websocket) {
            this.sendStroke(this.currentStroke);
        }

        // Sync back to main canvas
        this.syncFromFullscreen();

        this.currentStroke = null;
    }

    getMousePosFullscreen(e) {
        const rect = this.fullscreenCanvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
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

    drawLineFullscreen(x1, y1, x2, y2) {
        this.fullscreenCtx.save();
        
        if (this.currentTool === 'eraser') {
            this.fullscreenCtx.globalCompositeOperation = 'destination-out';
            this.fullscreenCtx.lineWidth = this.currentSize * 2;
        } else {
            this.fullscreenCtx.globalCompositeOperation = 'source-over';
            this.fullscreenCtx.strokeStyle = this.currentColor;
            this.fullscreenCtx.lineWidth = this.currentSize;
        }

        this.fullscreenCtx.beginPath();
        this.fullscreenCtx.moveTo(x1, y1);
        this.fullscreenCtx.lineTo(x2, y2);
        this.fullscreenCtx.stroke();
        
        this.fullscreenCtx.restore();
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

    syncToFullscreen() {
        if (!this.fullscreenCanvas || !this.canvas) return;
        
        // Check if canvases have valid dimensions
        if (this.canvas.width === 0 || this.canvas.height === 0 || 
            this.fullscreenCanvas.width === 0 || this.fullscreenCanvas.height === 0) {
            console.warn('Canvas has zero dimensions, skipping sync');
            return;
        }
        
        // Clear fullscreen canvas
        this.fullscreenCtx.clearRect(0, 0, this.fullscreenCanvas.width, this.fullscreenCanvas.height);
        
        // Scale and draw main canvas content
        const scaleX = this.fullscreenCanvas.width / this.canvas.width;
        const scaleY = this.fullscreenCanvas.height / this.canvas.height;
        const scale = Math.min(scaleX, scaleY);
        
        const offsetX = (this.fullscreenCanvas.width - this.canvas.width * scale) / 2;
        const offsetY = (this.fullscreenCanvas.height - this.canvas.height * scale) / 2;
        
        this.fullscreenCtx.drawImage(
            this.canvas, 
            offsetX, offsetY, 
            this.canvas.width * scale, 
            this.canvas.height * scale
        );
    }

    syncFromFullscreen() {
        if (!this.fullscreenCanvas || !this.canvas) return;
        
        // Check if canvases have valid dimensions
        if (this.canvas.width === 0 || this.canvas.height === 0 || 
            this.fullscreenCanvas.width === 0 || this.fullscreenCanvas.height === 0) {
            console.warn('Canvas has zero dimensions, skipping sync');
            return;
        }
        
        // Scale down fullscreen content to main canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const scaleX = this.canvas.width / this.fullscreenCanvas.width;
        const scaleY = this.canvas.height / this.fullscreenCanvas.height;
        const scale = Math.min(scaleX, scaleY);
        
        this.ctx.drawImage(
            this.fullscreenCanvas,
            0, 0,
            this.canvas.width, this.canvas.height
        );
    }

    enterFullscreen() {
        const fullscreenModal = document.getElementById('whiteboardFullscreen');
        if (fullscreenModal) {
            // Wait for modal to be visible before setting up canvas
            fullscreenModal.classList.add('active');
            
            // Use a timeout to ensure the modal is fully rendered
            setTimeout(() => {
                this.setupFullscreenCanvas();
                
                // Focus on canvas for better interaction
                setTimeout(() => {
                    if (this.fullscreenCanvas) {
                        this.fullscreenCanvas.focus();
                    }
                }, 100);
            }, 50);
        }
    }

    exitFullscreen() {
        const fullscreenModal = document.getElementById('whiteboardFullscreen');
        if (fullscreenModal) {
            fullscreenModal.classList.remove('active');
            this.syncFromFullscreen();
        }
    }
}

// Export for use in other modules
window.WhiteboardManager = WhiteboardManager;