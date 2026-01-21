/**
 * Etymology Explorer - Main Application
 * Handles initialization, render loop, and wires components together
 */
import { Renderer } from './canvas/renderer.js';
import { Viewport } from './canvas/viewport.js';
import { Interaction } from './canvas/interaction.js';
import { initDatabase, getStats } from './db/database.js';
import { buildTree, flattenTree } from './tree/builder.js';
import { Search } from './search/search.js';
import { SearchUI } from './search/ui.js';

class App {
    constructor() {
        // DOM elements
        this.canvas = document.getElementById('tree-canvas');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingText = this.loadingOverlay.querySelector('p');
        this.searchInput = document.getElementById('search-input');
        this.autocompleteDropdown = document.getElementById('autocomplete-dropdown');

        // Nodes on the canvas
        this.nodes = [];

        // Track displayed trees to position new ones
        this.treeCount = 0;

        // Initialize viewport (handles pan/zoom state)
        this.viewport = new Viewport(this.canvas);

        // Center viewport
        this.viewport.centerOn(0, 0);

        // Initialize renderer
        this.renderer = new Renderer(this.canvas);

        // Initialize interaction handler (handles mouse/touch events)
        this.interaction = new Interaction(
            this.canvas,
            this.viewport,
            () => this.nodes
        );

        // Initialize search (will be fully set up after DB loads)
        this.search = null;
        this.searchUI = null;

        // Start the render loop
        this.startRenderLoop();

        // Initialize database
        this.initializeDatabase();
    }

    /**
     * Initialize the database with progress feedback
     */
    async initializeDatabase() {
        try {
            await initDatabase((message) => {
                this.updateLoadingMessage(message);
            });

            // Log some stats to verify it worked
            const stats = getStats();
            console.log(`Database loaded: ${stats.termCount.toLocaleString()} terms, ${stats.relationshipCount.toLocaleString()} relationships`);

            // Initialize search functionality
            this.initializeSearch();

            // Enable search input
            this.searchInput.disabled = false;
            this.searchInput.placeholder = 'Search for a word...';

            // Hide loading overlay
            this.hideLoading();

        } catch (error) {
            console.error('Failed to initialize database:', error);
            this.updateLoadingMessage(`Error: ${error.message}`);
        }
    }

    /**
     * Initialize search components
     */
    initializeSearch() {
        // Create search controller
        this.search = new Search({
            debounceDelay: 300,
            maxResults: 50,
            minQueryLength: 1,
            onResults: (results, query) => {
                this.searchUI.renderResults(results, query);
            },
            onSelect: (term) => {
                this.handleTermSelected(term);
            },
            onClear: () => {
                this.searchUI.close();
            }
        });

        // Create search UI
        this.searchUI = new SearchUI(this.searchInput, this.autocompleteDropdown, {
            onInput: (query) => {
                this.search.handleInput(query);
            },
            onSelect: (term) => {
                this.handleTermSelected(term);
            }
        });
    }

    /**
     * Handle when a term is selected from search results
     */
    handleTermSelected(term) {
        console.log('Selected term:', term);

        // Clear the search input
        this.searchUI.clear();

        // Display the tree for this term
        this.addTree(term.id);
    }

    /**
     * Add a new tree to the canvas (doesn't clear existing trees)
     */
    addTree(termId) {
        // Build the tree from database
        const tree = buildTree(termId, 10);

        if (!tree) {
            console.warn('No tree found for term:', termId);
            return;
        }

        console.log('Built tree:', tree);

        // Flatten for rendering
        const flatNodes = flattenTree(tree);

        // Calculate offset for this tree (stack trees vertically)
        const offsetY = this.treeCount * 300;
        this.treeCount++;

        // Layout the tree
        this.layoutTreeSimple(flatNodes, 0, offsetY);

        // Add to existing nodes
        this.nodes = [...this.nodes, ...flatNodes];

        // Center on the new tree's root
        if (flatNodes.length > 0) {
            this.viewport.centerOn(flatNodes[0].x, flatNodes[0].y);
        }
    }

    /**
     * Clear all trees and display a single new tree
     */
    displayTree(termId) {
        this.nodes = [];
        this.treeCount = 0;
        this.addTree(termId);
    }

    /**
     * Simple tree layout (temporary until Phase 4)
     * Places nodes in horizontal levels
     */
    layoutTreeSimple(nodes, offsetX = 0, offsetY = 0) {
        const levelSpacing = 200;  // Horizontal space between levels
        const nodeSpacing = 60;    // Vertical space between siblings

        // Build a map of nodes by ID for quick lookup
        const nodeMap = new Map();
        for (const node of nodes) {
            nodeMap.set(node.id, node);
        }

        // Find root (node with no parent)
        const root = nodes.find(n => !n.parent);
        if (!root) return;

        // BFS to assign levels
        const queue = [{ node: root, level: 0 }];
        const levels = new Map(); // level -> nodes at that level

        while (queue.length > 0) {
            const { node, level } = queue.shift();

            if (!levels.has(level)) {
                levels.set(level, []);
            }
            levels.get(level).push(node);

            node.x = offsetX + level * levelSpacing;

            // Queue children
            for (const child of node.children || []) {
                queue.push({ node: child, level: level + 1 });
            }
        }

        // Assign y positions within each level
        for (const [, levelNodes] of levels) {
            const totalHeight = (levelNodes.length - 1) * nodeSpacing;
            const startY = offsetY - totalHeight / 2;

            levelNodes.forEach((node, index) => {
                node.y = startY + index * nodeSpacing;
            });
        }
    }

    /**
     * Update the loading message
     */
    updateLoadingMessage(message) {
        if (this.loadingText) {
            this.loadingText.textContent = message;
        }
    }

    /**
     * Main animation loop
     * Renders at 60 FPS using requestAnimationFrame
     */
    startRenderLoop() {
        const loop = () => {
            this.renderer.render(this.viewport, this.nodes);
            requestAnimationFrame(loop);
        };
        loop();
    }

    /**
     * Add a node to the canvas
     */
    addNode(node) {
        this.nodes.push(node);
    }

    /**
     * Remove a node from the canvas
     */
    removeNode(nodeId) {
        this.nodes = this.nodes.filter(n => n.id !== nodeId);
    }

    /**
     * Clear all nodes from the canvas
     */
    clearNodes() {
        this.nodes = [];
        this.treeCount = 0;
    }

    /**
     * Hide the loading overlay
     */
    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }

    /**
     * Show the loading overlay
     */
    showLoading() {
        this.loadingOverlay.classList.remove('hidden');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
