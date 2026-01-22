/**
 * Etymology Explorer - Main Application
 * Handles initialization, render loop, and wires components together
 */
import { Renderer } from './canvas/renderer.js';
import { Viewport } from './canvas/viewport.js';
import { Interaction } from './canvas/interaction.js';
import { initDatabase, getStats, getTermById } from './db/database.js';
import { buildTree, flattenTree } from './tree/builder.js';
import { Search } from './search/search.js';
import { SearchUI } from './search/ui.js';
import { Modal } from './modal/modal.js';

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
            () => this.nodes,
            {
                onNodeClick: (node) => this.handleNodeClick(node)
            }
        );

        // Initialize search (will be fully set up after DB loads)
        this.search = null;
        this.searchUI = null;

        // Initialize modal (will be fully set up after DB loads)
        this.modal = null;

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

            // Initialize modal
            this.initializeModal();

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
     * Initialize the modal for viewing term details
     */
    initializeModal() {
        this.modal = new Modal({
            onSelectTerm: (termId, parentNode, direction) => {
                // When a term is clicked in the modal, add it connected to the parent node
                // direction: 'ancestor' (left) or 'descendant' (right)
                this.addConnectedNode(termId, parentNode, direction);
            },
            onDeleteNode: (node) => {
                // Remove the node and its subtree from the canvas
                this.removeNodeTree(node);
            },
            onPruneLeaves: (node) => {
                // Remove all leaf descendants (single pass, not recursive)
                this.pruneLeaves(node);
            }
        });
    }

    /**
     * Handle when a node is clicked on the canvas
     */
    handleNodeClick(node) {
        console.log('Node clicked:', node);
        this.modal.open(node.id, node);
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
     * Add a single new node connected to an existing node on the canvas
     * Does not build out the new node's tree - just adds the single node
     * @param {string} termId - The term ID to add
     * @param {object} clickedNode - The node that was clicked in the modal
     * @param {string} direction - 'ancestor' (place left) or 'descendant' (place right)
     */
    addConnectedNode(termId, clickedNode, direction = 'descendant') {
        // Check if this node is already on the canvas
        const existingNode = this.nodes.find(n => n.id === termId);
        if (existingNode) {
            // Just center on it instead of adding duplicate
            this.viewport.centerOn(existingNode.x, existingNode.y);
            return;
        }

        // Get the term info from the database
        const term = getTermById(termId);
        if (!term) {
            console.warn('Term not found:', termId);
            return;
        }

        // Create a single node (matching the structure used by flattenTree)
        const newNode = {
            id: term.id,
            term: term.term,
            lang: term.lang,
            children: []
        };

        if (direction === 'ancestor') {
            // Ancestor: the new node is what the clicked node derives FROM
            // In the tree structure, etymological ancestors are CHILDREN (placed to the RIGHT)
            // This matches how buildTree works: it follows "derived from" relationships as children
            newNode.x = clickedNode.x + 200;
            newNode.y = clickedNode.y;
            newNode.parent = clickedNode;

            // Offset vertically if clicked node already has children
            if (clickedNode.children && clickedNode.children.length > 0) {
                const siblingCount = clickedNode.children.length;
                newNode.y = clickedNode.y + siblingCount * 60;
            }

            // Add to clicked node's children array
            if (!clickedNode.children) {
                clickedNode.children = [];
            }
            clickedNode.children.push(newNode);
        } else {
            // Descendant: the new node derives FROM the clicked node
            // In the tree structure, this means clicked node is an ancestor of the new node
            // So the new node becomes the PARENT (placed to the LEFT), and clicked node becomes its child
            newNode.x = clickedNode.x - 200;
            newNode.y = clickedNode.y;

            // New node becomes parent of clicked node
            newNode.parent = clickedNode.parent; // new node inherits clicked node's old parent
            clickedNode.parent = newNode;

            // Add clicked node as child of new node
            newNode.children = [clickedNode];

            // Offset vertically if there would be overlap with existing nodes at this x position
            const nodesAtSameX = this.nodes.filter(n => Math.abs(n.x - newNode.x) < 50);
            if (nodesAtSameX.length > 0) {
                const occupiedYs = nodesAtSameX.map(n => n.y);
                let targetY = newNode.y;
                while (occupiedYs.some(y => Math.abs(y - targetY) < 50)) {
                    targetY += 60;
                }
                newNode.y = targetY;
            }
        }

        // Add to the canvas
        this.nodes.push(newNode);

        // Center on the new node
        this.viewport.centerOn(newNode.x, newNode.y);
    }

    /**
     * Remove a node and all its descendants from the canvas
     * @param {object} node - The node to remove
     */
    removeNodeTree(node) {
        // Collect all nodes to remove (this node and all descendants)
        const nodesToRemove = new Set();

        const collectDescendants = (n) => {
            nodesToRemove.add(n);
            if (n.children) {
                for (const child of n.children) {
                    collectDescendants(child);
                }
            }
        };

        collectDescendants(node);

        // Remove from parent's children array
        if (node.parent && node.parent.children) {
            node.parent.children = node.parent.children.filter(c => c !== node);
        }

        // Filter out the removed nodes
        this.nodes = this.nodes.filter(n => !nodesToRemove.has(n));

        console.log(`Removed ${nodesToRemove.size} nodes from canvas`);
    }

    /**
     * Remove all leaf descendants of a node (single pass, not recursive)
     * Does not remove the node itself, even if it's a leaf
     * @param {object} node - The node whose leaves to prune
     */
    pruneLeaves(node) {
        const leavesToRemove = new Set();

        // Find all leaf descendants (but not the node itself)
        const findLeaves = (n, isRoot) => {
            if (!n.children || n.children.length === 0) {
                // It's a leaf - mark for removal unless it's the root
                if (!isRoot) {
                    leavesToRemove.add(n);
                }
                return;
            }
            for (const child of n.children) {
                findLeaves(child, false);
            }
        };

        findLeaves(node, true);

        if (leavesToRemove.size === 0) {
            console.log('No leaves to prune');
            return;
        }

        // Remove leaves from their parents' children arrays
        for (const leaf of leavesToRemove) {
            if (leaf.parent && leaf.parent.children) {
                leaf.parent.children = leaf.parent.children.filter(c => c !== leaf);
            }
        }

        // Filter out the removed leaves from the main nodes array
        this.nodes = this.nodes.filter(n => !leavesToRemove.has(n));

        console.log(`Pruned ${leavesToRemove.size} leaves`);
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
