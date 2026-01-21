/**
 * Interaction handler - mouse/touch events for pan, zoom, and node dragging
 * Differentiates between panning the canvas and dragging individual nodes
 */
export class Interaction {
    constructor(canvas, viewport, getNodes, options = {}) {
        this.canvas = canvas;
        this.viewport = viewport;
        this.getNodes = getNodes; // Function that returns current nodes array

        // Click callback
        this.onNodeClick = options.onNodeClick || (() => {});

        // Drag state
        this.isDragging = false;
        this.dragTarget = null; // null = pan canvas, otherwise = node being dragged
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Click detection state
        this.mouseDownX = 0;
        this.mouseDownY = 0;
        this.mouseDownNode = null;
        this.hasMoved = false;
        this.clickThreshold = 5; // pixels of movement allowed for a click

        // Touch state for pinch-to-zoom
        this.lastPinchDist = 0;

        this.setupMouseEvents();
        this.setupTouchEvents();
        this.setupWheelEvent();
    }

    /**
     * Get canvas-relative coordinates from a mouse event
     */
    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    /**
     * Hit test: find if a node is under the given screen coordinates
     * Returns the node if found, null otherwise
     */
    hitTest(screenX, screenY) {
        const nodes = this.getNodes();
        const worldPos = this.viewport.screenToWorld(screenX, screenY);

        // Check nodes in reverse order (top-most first)
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            if (this.isPointInNode(worldPos.x, worldPos.y, node)) {
                return node;
            }
        }
        return null;
    }

    /**
     * Move a node and all its descendants by a delta
     */
    moveNodeWithChildren(node, dx, dy) {
        node.x += dx;
        node.y += dy;

        // Recursively move all children
        if (node.children) {
            for (const child of node.children) {
                this.moveNodeWithChildren(child, dx, dy);
            }
        }
    }

    /**
     * Check if a world point is inside a node's bounding box
     */
    isPointInNode(worldX, worldY, node) {
        const padding = 12;
        const fontSize = 14;

        // Approximate text width (will be more accurate when we measure in renderer)
        const textWidth = node.term.length * 8;
        const boxWidth = textWidth + padding * 2;
        const boxHeight = fontSize + padding * 2;

        const halfWidth = boxWidth / 2;
        const halfHeight = boxHeight / 2;

        return (
            worldX >= node.x - halfWidth &&
            worldX <= node.x + halfWidth &&
            worldY >= node.y - halfHeight &&
            worldY <= node.y + halfHeight
        );
    }

    /**
     * Set up mouse event listeners
     */
    setupMouseEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            const coords = this.getCanvasCoords(e);
            const hitNode = this.hitTest(coords.x, coords.y);

            this.isDragging = true;
            this.dragTarget = hitNode; // null means pan, node means drag that node
            this.lastMouseX = coords.x;
            this.lastMouseY = coords.y;

            // Track for click detection
            this.mouseDownX = coords.x;
            this.mouseDownY = coords.y;
            this.mouseDownNode = hitNode;
            this.hasMoved = false;

            // Change cursor based on what we're dragging
            this.canvas.style.cursor = hitNode ? 'grabbing' : 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) {
                // Hover state - check if over a node
                const coords = this.getCanvasCoords(e);
                const hitNode = this.hitTest(coords.x, coords.y);
                this.canvas.style.cursor = hitNode ? 'pointer' : 'grab';
                return;
            }

            const coords = this.getCanvasCoords(e);
            const dx = coords.x - this.lastMouseX;
            const dy = coords.y - this.lastMouseY;

            // Check if we've moved past the click threshold
            const totalDx = Math.abs(coords.x - this.mouseDownX);
            const totalDy = Math.abs(coords.y - this.mouseDownY);
            if (totalDx > this.clickThreshold || totalDy > this.clickThreshold) {
                this.hasMoved = true;
            }

            if (this.dragTarget) {
                // Dragging a node - move it and all children in world coordinates
                const worldDx = dx / this.viewport.scale;
                const worldDy = dy / this.viewport.scale;
                this.moveNodeWithChildren(this.dragTarget, worldDx, worldDy);
            } else {
                // Panning the canvas
                this.viewport.pan(dx, dy);
            }

            this.lastMouseX = coords.x;
            this.lastMouseY = coords.y;
        });

        window.addEventListener('mouseup', (e) => {
            // Check if this was a click (no significant movement) on a node
            if (!this.hasMoved && this.mouseDownNode) {
                this.onNodeClick(this.mouseDownNode);
            }

            this.isDragging = false;
            this.dragTarget = null;
            this.mouseDownNode = null;
            this.canvas.style.cursor = 'grab';
        });

        // Reset cursor when mouse leaves canvas
        this.canvas.addEventListener('mouseleave', () => {
            if (!this.isDragging) {
                this.canvas.style.cursor = 'grab';
            }
        });
    }

    /**
     * Set up mouse wheel for zooming
     */
    setupWheelEvent() {
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();

            const coords = this.getCanvasCoords(e);

            // Zoom factor: scroll up = zoom in, scroll down = zoom out
            const factor = e.deltaY > 0 ? 0.9 : 1.1;

            this.viewport.zoom(factor, coords.x, coords.y);
        }, { passive: false });
    }

    /**
     * Set up touch events for mobile (pan and pinch-to-zoom)
     */
    setupTouchEvents() {
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                // Single finger - check for node hit or pan
                const touch = e.touches[0];
                const rect = this.canvas.getBoundingClientRect();
                const coords = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top
                };

                const hitNode = this.hitTest(coords.x, coords.y);
                this.isDragging = true;
                this.dragTarget = hitNode;
                this.lastMouseX = coords.x;
                this.lastMouseY = coords.y;

                // Track for tap detection
                this.mouseDownX = coords.x;
                this.mouseDownY = coords.y;
                this.mouseDownNode = hitNode;
                this.hasMoved = false;
            } else if (e.touches.length === 2) {
                // Two fingers - prepare for pinch zoom
                this.lastPinchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();

            if (e.touches.length === 1 && this.isDragging) {
                // Single finger drag
                const touch = e.touches[0];
                const rect = this.canvas.getBoundingClientRect();
                const coords = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top
                };

                const dx = coords.x - this.lastMouseX;
                const dy = coords.y - this.lastMouseY;

                // Check if we've moved past the click threshold
                const totalDx = Math.abs(coords.x - this.mouseDownX);
                const totalDy = Math.abs(coords.y - this.mouseDownY);
                if (totalDx > this.clickThreshold || totalDy > this.clickThreshold) {
                    this.hasMoved = true;
                }

                if (this.dragTarget) {
                    const worldDx = dx / this.viewport.scale;
                    const worldDy = dy / this.viewport.scale;
                    this.moveNodeWithChildren(this.dragTarget, worldDx, worldDy);
                } else {
                    this.viewport.pan(dx, dy);
                }

                this.lastMouseX = coords.x;
                this.lastMouseY = coords.y;
            } else if (e.touches.length === 2) {
                // Pinch to zoom
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );

                const factor = dist / this.lastPinchDist;

                // Zoom centered between the two fingers
                const rect = this.canvas.getBoundingClientRect();
                const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

                this.viewport.zoom(factor, centerX, centerY);
                this.lastPinchDist = dist;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', () => {
            // Check if this was a tap (no significant movement) on a node
            if (!this.hasMoved && this.mouseDownNode) {
                this.onNodeClick(this.mouseDownNode);
            }

            this.isDragging = false;
            this.dragTarget = null;
            this.mouseDownNode = null;
        });
    }
}
