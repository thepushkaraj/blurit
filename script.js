class ImageBlurTool {
    constructor() {
        this.imageCanvas = document.getElementById('imageCanvas');
        this.selectionCanvas = document.getElementById('selectionCanvas');
        this.imageCtx = this.imageCanvas.getContext('2d');
        this.selectionCtx = this.selectionCanvas.getContext('2d');
        
        this.originalImageData = null;
        this.currentImageData = null;
        this.selectionMask = null;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        
        this.blurIntensity = 5;
        this.brushSize = 30;
        
        // Selection modes
        this.selectionMode = 'manual'; // 'manual' or 'region'
        this.isSelectingRegion = false;
        this.regionStart = { x: 0, y: 0 };
        this.regionEnd = { x: 0, y: 0 };
        
        // Custom cursor
        this.customCursor = null;
        this.createCustomCursor();
        
        // Performance optimization
        this.blurUpdatePending = false;
        this.lastBlurUpdate = 0;
        this.blurThrottleDelay = 50; // Update blur every 50ms max
        this.preBlurredImage = null; // Cache blurred version
        this.blurDebounceTimeout = null; // Debounce timeout for slider
        
        this.initializeEventListeners();
    }
    
    initializeEventListeners() {
        // File upload
        document.getElementById('imageUpload').addEventListener('change', (e) => {
            this.handleImageUpload(e);
        });
        
        // Selection mode
        document.getElementById('selectionMode').addEventListener('change', (e) => {
            this.selectionMode = e.target.value;
            this.updateCursorForMode();
        });
        
        // Controls
        document.getElementById('blurIntensity').addEventListener('input', (e) => {
            this.blurIntensity = parseFloat(e.target.value);
            document.getElementById('blurValue').textContent = `${this.blurIntensity}px`;
            this.preBlurredImage = null; // Invalidate cache
            this.debounceBlurUpdate();
        });
        
        document.getElementById('brushSize').addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            document.getElementById('brushValue').textContent = `${this.brushSize}px`;
            this.updateCustomCursor();
        });
        
        // Buttons
        document.getElementById('clearSelection').addEventListener('click', () => {
            this.clearSelection();
        });
        
        document.getElementById('downloadImage').addEventListener('click', () => {
            this.downloadImage();
        });
        
        // Canvas drawing events
        this.selectionCanvas.addEventListener('mousedown', (e) => {
            if (this.selectionMode === 'manual') {
                this.startDrawing(e);
            } else if (this.selectionMode === 'region') {
                this.startRegionSelection(e);
            }
        });
        
        this.selectionCanvas.addEventListener('mousemove', (e) => {
            this.updateCursorPosition(e);
            if (this.selectionMode === 'manual') {
                this.draw(e);
            } else if (this.selectionMode === 'region') {
                this.updateRegionSelection(e);
            }
        });
        
        this.selectionCanvas.addEventListener('mouseup', () => {
            if (this.selectionMode === 'manual') {
                this.stopDrawing();
            } else if (this.selectionMode === 'region') {
                this.finishRegionSelection();
            }
        });
        
        this.selectionCanvas.addEventListener('mouseenter', () => {
            this.showCustomCursor();
            this.updateCursorForMode();
        });
        
        this.selectionCanvas.addEventListener('mouseleave', () => {
            this.hideCustomCursor();
            if (this.selectionMode === 'manual') {
                this.stopDrawing();
            } else if (this.selectionMode === 'region') {
                this.cancelRegionSelection();
            }
        });
        
        // Touch events for mobile
        this.selectionCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.selectionCanvas.getBoundingClientRect();
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.selectionCanvas.dispatchEvent(mouseEvent);
            this.hideCustomCursor(); // Hide cursor on touch devices
        });
        
        this.selectionCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.selectionCanvas.dispatchEvent(mouseEvent);
        });
        
        this.selectionCanvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.selectionCanvas.dispatchEvent(mouseEvent);
        });
    }
    
    createCustomCursor() {
        this.customCursor = document.createElement('div');
        this.customCursor.className = 'custom-cursor';
        document.body.appendChild(this.customCursor);
        this.updateCustomCursor();
    }
    
    updateCustomCursor() {
        if (this.customCursor) {
            if (this.selectionMode === 'manual') {
                this.customCursor.style.width = `${this.brushSize}px`;
                this.customCursor.style.height = `${this.brushSize}px`;
                this.customCursor.style.borderRadius = '50%';
            } else {
                this.customCursor.style.width = '20px';
                this.customCursor.style.height = '20px';
                this.customCursor.style.borderRadius = '0%';
            }
        }
    }
    
    updateCursorForMode() {
        if (this.customCursor) {
            this.updateCustomCursor();
            if (this.selectionMode === 'region') {
                this.selectionCanvas.style.cursor = 'crosshair';
            } else {
                this.selectionCanvas.style.cursor = 'none';
            }
        }
    }
    
    showCustomCursor() {
        if (this.customCursor && this.selectionMode === 'manual') {
            this.customCursor.style.display = 'block';
        }
    }
    
    hideCustomCursor() {
        if (this.customCursor) {
            this.customCursor.style.display = 'none';
        }
    }
    
    updateCursorPosition(e) {
        if (this.customCursor && this.selectionMode === 'manual') {
            this.customCursor.style.left = `${e.pageX}px`;
            this.customCursor.style.top = `${e.pageY}px`;
        }
    }
    
    handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.setupCanvas(img);
                document.getElementById('canvasSection').style.display = 'block';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    setupCanvas(img) {
        // Calculate canvas size to fit the container while maintaining aspect ratio
        const maxWidth = Math.min(800, window.innerWidth - 40);
        const maxHeight = Math.min(600, window.innerHeight - 200);
        
        let { width, height } = this.calculateCanvasSize(img.width, img.height, maxWidth, maxHeight);
        
        // Set canvas dimensions
        this.imageCanvas.width = width;
        this.imageCanvas.height = height;
        this.selectionCanvas.width = width;
        this.selectionCanvas.height = height;
        
        // Draw the image
        this.imageCtx.drawImage(img, 0, 0, width, height);
        
        // Store original image data
        this.originalImageData = this.imageCtx.getImageData(0, 0, width, height);
        this.currentImageData = this.imageCtx.getImageData(0, 0, width, height);
        
        // Pre-blur the image for performance
        this.preBlurredImage = null;
        this.generatePreBlurredImage();
        
        // Initialize selection mask
        this.selectionMask = new ImageData(width, height);
        
        // Clear selection canvas
        this.selectionCtx.clearRect(0, 0, width, height);
    }
    
    calculateCanvasSize(imgWidth, imgHeight, maxWidth, maxHeight) {
        const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
        return {
            width: Math.floor(imgWidth * ratio),
            height: Math.floor(imgHeight * ratio)
        };
    }
    
    startDrawing(e) {
        this.isDrawing = true;
        const rect = this.selectionCanvas.getBoundingClientRect();
        this.lastX = e.clientX - rect.left;
        this.lastY = e.clientY - rect.top;
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        const rect = this.selectionCanvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        // Draw on selection mask
        this.drawOnMask(this.lastX, this.lastY, currentX, currentY);
        
        // Update selection canvas visualization
        this.updateSelectionVisualization();
        
        // Schedule blur update (throttled for performance)
        this.scheduleBlurUpdate();
        
        this.lastX = currentX;
        this.lastY = currentY;
    }
    
    stopDrawing() {
        this.isDrawing = false;
    }
    
    drawOnMask(x1, y1, x2, y2) {
        const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const steps = Math.max(1, Math.floor(distance));
        
        for (let i = 0; i <= steps; i++) {
            const t = steps === 0 ? 0 : i / steps;
            const x = Math.round(x1 + (x2 - x1) * t);
            const y = Math.round(y1 + (y2 - y1) * t);
            
            this.drawCircleOnMask(x, y, this.brushSize / 2);
        }
    }
    
    drawCircleOnMask(centerX, centerY, radius) {
        const imageData = this.selectionMask;
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        
        const minX = Math.max(0, Math.floor(centerX - radius));
        const maxX = Math.min(width - 1, Math.floor(centerX + radius));
        const minY = Math.max(0, Math.floor(centerY - radius));
        const maxY = Math.min(height - 1, Math.floor(centerY + radius));
        
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
                if (distance <= radius) {
                    const index = (y * width + x) * 4;
                    
                    // Create smooth falloff at edges
                    let alpha;
                    if (distance <= radius * 0.8) {
                        alpha = 1; // Full opacity in center
                    } else {
                        // Smooth falloff at edges
                        const falloffDistance = distance - (radius * 0.8);
                        const falloffRange = radius * 0.2;
                        alpha = 1 - (falloffDistance / falloffRange);
                    }
                    
                    alpha = Math.max(0, Math.min(1, alpha));
                    const newAlpha = Math.floor(alpha * 255);
                    
                    // Use max to allow overlapping strokes
                    data[index + 3] = Math.max(data[index + 3], newAlpha);
                }
            }
        }
    }
    
    updateSelectionVisualization() {
        this.selectionCtx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
        
        // Create a temporary canvas for the overlay
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.selectionCanvas.width;
        tempCanvas.height = this.selectionCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw selection mask with blue overlay
        const overlayData = new ImageData(this.selectionCanvas.width, this.selectionCanvas.height);
        const maskData = this.selectionMask.data;
        const overlayPixels = overlayData.data;
        
        for (let i = 0; i < maskData.length; i += 4) {
            if (maskData[i + 3] > 0) {
                overlayPixels[i] = 100; // Blue
                overlayPixels[i + 1] = 150; // Green
                overlayPixels[i + 2] = 255; // Red
                overlayPixels[i + 3] = Math.floor(maskData[i + 3] * 0.3); // Alpha
            }
        }
        
        tempCtx.putImageData(overlayData, 0, 0);
        this.selectionCtx.drawImage(tempCanvas, 0, 0);
    }
    
    generatePreBlurredImage() {
        if (!this.originalImageData) return;
        
        const imageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );
        
        this.preBlurredImage = this.gaussianBlur(
            imageData.data, 
            imageData.width, 
            imageData.height, 
            this.blurIntensity
        );
    }
    
    scheduleBlurUpdate() {
        if (this.blurUpdatePending) return;
        
        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastBlurUpdate;
        
        if (timeSinceLastUpdate >= this.blurThrottleDelay) {
            this.applyBlurOptimized();
            this.lastBlurUpdate = now;
        } else {
            this.blurUpdatePending = true;
            setTimeout(() => {
                this.applyBlurOptimized();
                this.lastBlurUpdate = Date.now();
                this.blurUpdatePending = false;
            }, this.blurThrottleDelay - timeSinceLastUpdate);
        }
    }
    
    debounceBlurUpdate() {
        // Clear any existing timeout
        if (this.blurDebounceTimeout) {
            clearTimeout(this.blurDebounceTimeout);
        }
        
        // Set a new timeout to update blur after user stops moving slider
        this.blurDebounceTimeout = setTimeout(() => {
            if (this.selectionMask && this.originalImageData) {
                this.scheduleBlurUpdate();
            }
            this.blurDebounceTimeout = null;
        }, 150); // Wait 150ms after user stops moving slider
    }
    
    applyBlurOptimized() {
        if (!this.preBlurredImage) {
            this.generatePreBlurredImage();
        }
        
        // Start with original image data
        const imageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );
        
        // Apply selective blur using pre-blurred image
        this.applySelectiveBlurOptimized(imageData);
        
        // Update canvas
        this.imageCtx.putImageData(imageData, 0, 0);
        this.currentImageData = imageData;
    }
    
    applySelectiveBlurOptimized(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const maskData = this.selectionMask.data;
        const blurredData = this.preBlurredImage;
        
        // Fast pixel-by-pixel blending using pre-blurred image
        for (let i = 0; i < maskData.length; i += 4) {
            const maskAlpha = maskData[i + 3] / 255;
            
            if (maskAlpha > 0) {
                // Direct blending without recalculating blur
                const invAlpha = 1 - maskAlpha;
                data[i] = Math.round(data[i] * invAlpha + blurredData[i] * maskAlpha);
                data[i + 1] = Math.round(data[i + 1] * invAlpha + blurredData[i + 1] * maskAlpha);
                data[i + 2] = Math.round(data[i + 2] * invAlpha + blurredData[i + 2] * maskAlpha);
            }
        }
    }
    
    applyBlur() {
        // Fallback method - calls optimized version
        this.applyBlurOptimized();
    }
    
    applySelectiveBlur(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const maskData = this.selectionMask.data;
        
        // Create a copy for blur calculation
        const originalData = new Uint8ClampedArray(data);
        
        // Apply Gaussian blur to the entire image first
        const blurredData = this.gaussianBlur(originalData, width, height, this.blurIntensity);
        
        // Blend original and blurred based on mask
        for (let i = 0; i < maskData.length; i += 4) {
            const maskAlpha = maskData[i + 3] / 255;
            
            if (maskAlpha > 0) {
                // Smooth blending between original and blurred
                data[i] = Math.round(originalData[i] * (1 - maskAlpha) + blurredData[i] * maskAlpha);
                data[i + 1] = Math.round(originalData[i + 1] * (1 - maskAlpha) + blurredData[i + 1] * maskAlpha);
                data[i + 2] = Math.round(originalData[i + 2] * (1 - maskAlpha) + blurredData[i + 2] * maskAlpha);
            }
        }
    }
    
    gaussianBlur(data, width, height, radius) {
        const result = new Uint8ClampedArray(data);
        const kernel = this.createGaussianKernel(radius);
        const kernelSize = kernel.length;
        const kernelRadius = Math.floor(kernelSize / 2);
        
        // Horizontal pass
        const temp = new Uint8ClampedArray(data.length);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0;
                let weightSum = 0;
                
                for (let k = 0; k < kernelSize; k++) {
                    const sampleX = Math.min(Math.max(x + k - kernelRadius, 0), width - 1);
                    const sampleIndex = (y * width + sampleX) * 4;
                    const weight = kernel[k];
                    
                    r += data[sampleIndex] * weight;
                    g += data[sampleIndex + 1] * weight;
                    b += data[sampleIndex + 2] * weight;
                    a += data[sampleIndex + 3] * weight;
                    weightSum += weight;
                }
                
                const index = (y * width + x) * 4;
                temp[index] = r / weightSum;
                temp[index + 1] = g / weightSum;
                temp[index + 2] = b / weightSum;
                temp[index + 3] = a / weightSum;
            }
        }
        
        // Vertical pass
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0;
                let weightSum = 0;
                
                for (let k = 0; k < kernelSize; k++) {
                    const sampleY = Math.min(Math.max(y + k - kernelRadius, 0), height - 1);
                    const sampleIndex = (sampleY * width + x) * 4;
                    const weight = kernel[k];
                    
                    r += temp[sampleIndex] * weight;
                    g += temp[sampleIndex + 1] * weight;
                    b += temp[sampleIndex + 2] * weight;
                    a += temp[sampleIndex + 3] * weight;
                    weightSum += weight;
                }
                
                const index = (y * width + x) * 4;
                result[index] = Math.round(r / weightSum);
                result[index + 1] = Math.round(g / weightSum);
                result[index + 2] = Math.round(b / weightSum);
                result[index + 3] = Math.round(a / weightSum);
            }
        }
        
        return result;
    }
    
    createGaussianKernel(radius) {
        const sigma = radius / 3;
        const size = Math.ceil(radius * 2) + 1;
        const kernel = new Array(size);
        const center = Math.floor(size / 2);
        let sum = 0;
        
        for (let i = 0; i < size; i++) {
            const x = i - center;
            kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
            sum += kernel[i];
        }
        
        // Normalize
        for (let i = 0; i < size; i++) {
            kernel[i] /= sum;
        }
        
        return kernel;
    }
    
    // Region selection methods
    startRegionSelection(e) {
        this.isSelectingRegion = true;
        const rect = this.selectionCanvas.getBoundingClientRect();
        this.regionStart.x = e.clientX - rect.left;
        this.regionStart.y = e.clientY - rect.top;
        this.regionEnd.x = this.regionStart.x;
        this.regionEnd.y = this.regionStart.y;
    }
    
    updateRegionSelection(e) {
        if (!this.isSelectingRegion) return;
        
        const rect = this.selectionCanvas.getBoundingClientRect();
        this.regionEnd.x = e.clientX - rect.left;
        this.regionEnd.y = e.clientY - rect.top;
        
        // Draw selection rectangle
        this.drawSelectionRectangle();
    }
    
    finishRegionSelection() {
        if (!this.isSelectingRegion) return;
        
        this.isSelectingRegion = false;
        
        // Fill the selected region in the mask
        this.fillRegionMask();
        
        // Update visualization and apply blur
        this.updateSelectionVisualization();
        this.scheduleBlurUpdate();
    }
    
    cancelRegionSelection() {
        this.isSelectingRegion = false;
        this.selectionCtx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
        this.updateSelectionVisualization();
    }
    
    drawSelectionRectangle() {
        // Clear and redraw selection overlay
        this.selectionCtx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
        
        // Draw existing selection mask
        this.updateSelectionVisualization();
        
        // Draw current selection rectangle
        const x = Math.min(this.regionStart.x, this.regionEnd.x);
        const y = Math.min(this.regionStart.y, this.regionEnd.y);
        const width = Math.abs(this.regionEnd.x - this.regionStart.x);
        const height = Math.abs(this.regionEnd.y - this.regionStart.y);
        
        this.selectionCtx.strokeStyle = '#667eea';
        this.selectionCtx.lineWidth = 2;
        this.selectionCtx.setLineDash([5, 5]);
        this.selectionCtx.strokeRect(x, y, width, height);
        
        // Fill with semi-transparent overlay
        this.selectionCtx.fillStyle = 'rgba(102, 126, 234, 0.2)';
        this.selectionCtx.fillRect(x, y, width, height);
        this.selectionCtx.setLineDash([]);
    }
    
    fillRegionMask() {
        const x1 = Math.min(this.regionStart.x, this.regionEnd.x);
        const y1 = Math.min(this.regionStart.y, this.regionEnd.y);
        const x2 = Math.max(this.regionStart.x, this.regionEnd.x);
        const y2 = Math.max(this.regionStart.y, this.regionEnd.y);
        
        const maskData = this.selectionMask.data;
        const width = this.selectionMask.width;
        
        for (let y = Math.max(0, Math.floor(y1)); y <= Math.min(this.selectionMask.height - 1, Math.floor(y2)); y++) {
            for (let x = Math.max(0, Math.floor(x1)); x <= Math.min(width - 1, Math.floor(x2)); x++) {
                const index = (y * width + x) * 4;
                maskData[index + 3] = 255; // Full opacity
            }
        }
    }
    
    clearSelection() {
        // Clear selection mask
        this.selectionMask = new ImageData(this.selectionCanvas.width, this.selectionCanvas.height);
        
        // Clear selection canvas
        this.selectionCtx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
        
        // Restore original image
        this.imageCtx.putImageData(this.originalImageData, 0, 0);
        this.currentImageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );
    }
    
    downloadImage() {
        const link = document.createElement('a');
        link.download = 'blurred-image.png';
        link.href = this.imageCanvas.toDataURL();
        link.click();
    }
}

// Initialize the tool when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ImageBlurTool();
});