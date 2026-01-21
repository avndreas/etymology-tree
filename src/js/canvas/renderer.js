/**
 * Canvas renderer for etymology trees
 * Handles drawing the beige grid background and tree nodes
 */
export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gridSize = 50;  // Grid cell size in world units

        // Colors from CSS theme
        this.colors = {
            background: '#f5f0e6',
            grid: '#e0d9c8',
            text: '#3a3226',
            accent: '#8b7355',
            nodeBg: '#fff9f0',
            nodeBorder: '#c4b7a3'
        };

        // Handle high DPI displays
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * Resize canvas to match container and handle device pixel ratio
     */
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Set actual canvas size in memory
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        // Scale context to handle high DPI
        this.ctx.scale(dpr, dpr);

        // Store logical dimensions
        this.width = rect.width;
        this.height = rect.height;
    }

    /**
     * Clear canvas with background color
     */
    clear() {
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    /**
     * Draw the beige grid background
     * Grid responds to viewport pan/zoom
     */
    drawGrid(viewport) {
        const { ctx, gridSize, width, height, colors } = this;
        const { offsetX, offsetY, scale } = viewport;

        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;

        // Calculate scaled grid size
        const scaledGrid = gridSize * scale;

        // Don't draw grid if zoomed out too far (would be too dense)
        if (scaledGrid < 10) return;

        // Calculate where to start drawing (accounting for pan offset)
        const startX = offsetX % scaledGrid;
        const startY = offsetY % scaledGrid;

        ctx.beginPath();

        // Vertical lines
        for (let x = startX; x < width; x += scaledGrid) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }

        // Horizontal lines
        for (let y = startY; y < height; y += scaledGrid) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }

        ctx.stroke();
    }

    /**
     * Draw a single node at its world position
     * Node is transformed through the viewport
     */
    drawNode(node, viewport) {
        const { ctx, colors } = this;

        // Convert world position to screen position
        const screen = viewport.worldToScreen(node.x, node.y);

        const padding = 12;
        const baseFontSize = 14;
        const fontSize = baseFontSize * viewport.scale;

        // Don't render if too small to read
        if (fontSize < 6) return;

        ctx.font = `${fontSize}px Georgia`;

        const textWidth = ctx.measureText(node.term).width;
        const boxWidth = textWidth + padding * 2 * viewport.scale;
        const boxHeight = fontSize + padding * 2 * viewport.scale;

        // Node background
        ctx.fillStyle = colors.nodeBg;
        ctx.strokeStyle = colors.nodeBorder;
        ctx.lineWidth = 2 * viewport.scale;

        ctx.beginPath();
        ctx.roundRect(
            screen.x - boxWidth / 2,
            screen.y - boxHeight / 2,
            boxWidth,
            boxHeight,
            6 * viewport.scale
        );
        ctx.fill();
        ctx.stroke();

        // Node text
        ctx.fillStyle = colors.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.term, screen.x, screen.y);

        // Language label (smaller, below the node)
        if (node.lang) {
            const langFontSize = fontSize * 0.75;
            if (langFontSize >= 6) {
                ctx.font = `${langFontSize}px Georgia`;
                ctx.fillStyle = colors.accent;
                ctx.fillText(node.lang, screen.x, screen.y + boxHeight / 2 + 8 * viewport.scale);
            }
        }
    }

    /**
     * Draw an edge between two nodes
     * Includes a small dot at the source (parent) end to indicate direction
     */
    drawEdge(fromNode, toNode, viewport) {
        const { ctx, colors } = this;

        const from = viewport.worldToScreen(fromNode.x, fromNode.y);
        const to = viewport.worldToScreen(toNode.x, toNode.y);

        ctx.strokeStyle = colors.nodeBorder;
        ctx.lineWidth = 2 * viewport.scale;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();

        // Draw a small dot at the source (parent) end to indicate direction
        const dotRadius = 4 * viewport.scale;
        if (dotRadius >= 2) {  // Only draw if visible
            ctx.fillStyle = colors.nodeBorder;
            ctx.beginPath();
            ctx.arc(from.x, from.y, dotRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * Main render function
     * Called each frame by the animation loop
     */
    render(viewport, nodes = []) {
        // Reset transform for high DPI
        const dpr = window.devicePixelRatio || 1;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.clear();
        this.drawGrid(viewport);

        // Draw edges first (behind nodes)
        for (const node of nodes) {
            if (node.parent) {
                this.drawEdge(node.parent, node, viewport);
            }
        }

        // Draw all nodes on top
        for (const node of nodes) {
            this.drawNode(node, viewport);
        }
    }
}
