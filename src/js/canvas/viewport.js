/**
 * Viewport - manages pan/zoom state and coordinate transformations
 * Handles the "camera" that views the infinite canvas
 */
export class Viewport {
    constructor(canvas) {
        this.canvas = canvas;

        // Pan offset (in screen pixels)
        this.offsetX = 0;
        this.offsetY = 0;

        // Zoom level (1 = 100%)
        this.scale = 1;

        // Zoom constraints
        this.minScale = 0.1;
        this.maxScale = 5;

        // Logical dimensions (set by resize)
        this.width = 0;
        this.height = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * Update dimensions when canvas resizes
     */
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
    }

    /**
     * Convert screen coordinates to world coordinates
     * Use this to determine what world position the mouse is at
     */
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.offsetX) / this.scale,
            y: (screenY - this.offsetY) / this.scale
        };
    }

    /**
     * Convert world coordinates to screen coordinates
     * Use this to draw things at their world position
     */
    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.scale + this.offsetX,
            y: worldY * this.scale + this.offsetY
        };
    }

    /**
     * Pan the viewport by a delta (in screen pixels)
     */
    pan(dx, dy) {
        this.offsetX += dx;
        this.offsetY += dy;
    }

    /**
     * Zoom the viewport, centered on a screen position
     * This keeps the point under the cursor stationary while zooming
     */
    zoom(factor, centerScreenX, centerScreenY) {
        const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));

        if (newScale !== this.scale) {
            // Get world position under cursor before zoom
            const worldPos = this.screenToWorld(centerScreenX, centerScreenY);

            // Apply new scale
            this.scale = newScale;

            // Calculate where that world position is now on screen
            const newScreenPos = this.worldToScreen(worldPos.x, worldPos.y);

            // Adjust offset so the world position stays under the cursor
            this.offsetX += centerScreenX - newScreenPos.x;
            this.offsetY += centerScreenY - newScreenPos.y;
        }
    }

    /**
     * Center the viewport on a world position
     */
    centerOn(worldX, worldY) {
        this.offsetX = this.width / 2 - worldX * this.scale;
        this.offsetY = this.height / 2 - worldY * this.scale;
    }

    /**
     * Reset to default view (centered, 100% zoom)
     */
    reset() {
        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1;
    }
}
