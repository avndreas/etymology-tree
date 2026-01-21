/**
 * Modal - displays term details, definitions, and related words
 * Shows ancestors (derived from) and descendants (gave rise to)
 */
import { getTermById, getRelationships, getTermsReferencingId, getDefinitions } from '../db/database.js';

export class Modal {
    constructor(options = {}) {
        this.overlay = document.getElementById('modal-overlay');
        this.modal = document.getElementById('modal');
        this.closeBtn = document.getElementById('modal-close');
        this.content = document.getElementById('modal-content');

        // Callbacks
        this.onSelectTerm = options.onSelectTerm || (() => {});
        this.onDeleteNode = options.onDeleteNode || (() => {});
        this.onPruneLeaves = options.onPruneLeaves || (() => {});

        // Current term being displayed
        this.currentTerm = null;
        this.currentNode = null; // The canvas node (has position info)

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Close on X button click
        this.closeBtn.addEventListener('click', () => this.close());

        // Close on overlay click (but not modal itself)
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });
    }

    /**
     * Open the modal for a specific term
     * @param {string} termId - The term ID to display
     * @param {object} node - The canvas node object (optional, for delete functionality)
     */
    open(termId, node = null) {
        const term = getTermById(termId);
        if (!term) {
            console.warn('Term not found:', termId);
            return;
        }

        this.currentTerm = term;
        this.currentNode = node;
        this.render(term);
        this.overlay.classList.add('active');
    }

    /**
     * Close the modal
     */
    close() {
        this.overlay.classList.remove('active');
        this.currentTerm = null;
        this.currentNode = null;
    }

    /**
     * Check if modal is open
     */
    isOpen() {
        return this.overlay.classList.contains('active');
    }

    /**
     * Render the modal content for a term
     */
    render(term) {
        // Get definitions (English only via WordNet)
        const definitions = getDefinitions(term.term, term.lang);

        // Get relationships (ancestors - what this term comes from)
        const relationships = getRelationships(term.id);
        const ancestors = relationships.map(rel => {
            const relTerm = getTermById(rel.to_id);
            return relTerm ? { ...relTerm, reltype: rel.reltype } : null;
        }).filter(Boolean);

        // Get descendants (terms that come from this term)
        const descendants = getTermsReferencingId(term.id, 50);

        // Build HTML
        let html = `
            <div class="modal-header">
                <h2 class="modal-title">${this.escapeHtml(term.term)}</h2>
                <span class="modal-lang">${this.escapeHtml(term.lang)}</span>
            </div>
        `;

        // Actions section (delete and prune buttons)
        if (this.currentNode) {
            const leafCount = this.countLeafDescendants(this.currentNode);
            html += `
                <div class="modal-actions">
                    <button class="modal-delete-btn" title="Remove from canvas">Remove from canvas</button>
                    ${leafCount > 0 ? `<button class="modal-prune-btn" title="Remove all leaf nodes (${leafCount})">Prune leaves (${leafCount})</button>` : ''}
                </div>
            `;
        }

        // Definitions section (if available)
        if (definitions.length > 0) {
            html += `
                <div class="modal-section">
                    <h3 class="modal-section-title">Definitions</h3>
                    <div class="modal-definitions">
                        ${definitions.slice(0, 5).map(def => `
                            <div class="definition-item">
                                <span class="definition-pos">${this.escapeHtml(def.pos)}</span>
                                <span class="definition-text">${this.escapeHtml(def.definition)}</span>
                            </div>
                        `).join('')}
                        ${definitions.length > 5 ? `<div class="definition-more">+${definitions.length - 5} more definitions</div>` : ''}
                    </div>
                </div>
            `;
        }

        // Ancestors section (derived from) - placed to the LEFT of current node
        html += `
            <div class="modal-section">
                <h3 class="modal-section-title">
                    Derived from
                    <span class="modal-section-count">(${ancestors.length})</span>
                </h3>
                <div class="modal-list-scroll">
                    ${ancestors.length > 0 ? `
                        <ul class="modal-term-list">
                            ${ancestors.map(a => `
                                <li class="modal-term-item" data-id="${this.escapeHtml(a.id)}" data-direction="ancestor">
                                    <span class="term-name">${this.escapeHtml(a.term)}</span>
                                    <span class="term-lang">${this.escapeHtml(a.lang)}</span>
                                    <span class="term-reltype">${this.formatRelType(a.reltype)}</span>
                                </li>
                            `).join('')}
                        </ul>
                    ` : '<p class="modal-empty">No known ancestors</p>'}
                </div>
            </div>
        `;

        // Descendants section (gave rise to) - placed to the RIGHT of current node
        html += `
            <div class="modal-section">
                <h3 class="modal-section-title">
                    Gave rise to
                    <span class="modal-section-count">(${descendants.length}${descendants.length >= 50 ? '+' : ''})</span>
                </h3>
                <div class="modal-list-scroll">
                    ${descendants.length > 0 ? `
                        <ul class="modal-term-list">
                            ${descendants.map(d => `
                                <li class="modal-term-item" data-id="${this.escapeHtml(d.id)}" data-direction="descendant">
                                    <span class="term-name">${this.escapeHtml(d.term)}</span>
                                    <span class="term-lang">${this.escapeHtml(d.lang)}</span>
                                    <span class="term-reltype">${this.formatRelType(d.reltype)}</span>
                                </li>
                            `).join('')}
                        </ul>
                    ` : '<p class="modal-empty">No known descendants</p>'}
                </div>
            </div>
        `;

        this.content.innerHTML = html;

        // Add click handlers to term items
        this.content.querySelectorAll('.modal-term-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const direction = item.dataset.direction; // 'ancestor' or 'descendant'
                this.onSelectTerm(id, this.currentNode, direction);
            });
        });

        // Add click handler for delete button
        const deleteBtn = this.content.querySelector('.modal-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (this.currentNode) {
                    this.onDeleteNode(this.currentNode);
                    this.close();
                }
            });
        }

        // Add click handler for prune button
        const pruneBtn = this.content.querySelector('.modal-prune-btn');
        if (pruneBtn) {
            pruneBtn.addEventListener('click', () => {
                if (this.currentNode) {
                    this.onPruneLeaves(this.currentNode);
                    // Re-render to update the leaf count
                    this.render(this.currentTerm);
                }
            });
        }
    }

    /**
     * Count leaf descendants of a node (nodes with no children, excluding the node itself)
     */
    countLeafDescendants(node) {
        let count = 0;

        const countLeaves = (n, isRoot) => {
            if (!n.children || n.children.length === 0) {
                // It's a leaf - count it unless it's the root node
                if (!isRoot) count++;
                return;
            }
            for (const child of n.children) {
                countLeaves(child, false);
            }
        };

        countLeaves(node, true);
        return count;
    }

    /**
     * Format relationship type for display
     */
    formatRelType(reltype) {
        const typeMap = {
            'derived': 'derived',
            'inherited': 'inherited',
            'borrowed': 'borrowed',
            'learned': 'learned borrowing',
            'calque': 'calque',
            'compound': 'compound',
            'prefix': 'prefix',
            'suffix': 'suffix',
            'blend': 'blend',
            'affix': 'affix'
        };
        return typeMap[reltype] || reltype || '';
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
