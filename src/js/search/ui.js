/**
 * Search UI - handles rendering autocomplete dropdown and keyboard navigation
 */

export class SearchUI {
    constructor(inputElement, dropdownElement, options = {}) {
        this.input = inputElement;
        this.dropdown = dropdownElement;

        // Callbacks
        this.onInput = options.onInput || (() => {});
        this.onSelect = options.onSelect || (() => {});

        // State
        this.results = [];
        this.selectedIndex = -1;
        this.isOpen = false;

        this.setupEventListeners();
    }

    /**
     * Set up event listeners for input and keyboard navigation
     */
    setupEventListeners() {
        // Input event - trigger search on typing
        this.input.addEventListener('input', (e) => {
            this.onInput(e.target.value);
        });

        // Keyboard navigation
        this.input.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.moveSelection(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.moveSelection(-1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (this.selectedIndex >= 0) {
                        this.selectCurrent();
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.close();
                    this.input.blur();
                    break;
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
                this.close();
            }
        });

        // Reopen on focus if there are results
        this.input.addEventListener('focus', () => {
            if (this.results.length > 0) {
                this.open();
            }
        });
    }

    /**
     * Render search results in the dropdown
     * @param {Array} results - Array of term objects
     * @param {string} query - The search query (for highlighting)
     */
    renderResults(results, query) {
        this.results = results;
        this.selectedIndex = -1;

        if (results.length === 0) {
            this.close();
            return;
        }

        // Build HTML for results
        const html = results.map((result, index) => {
            const highlightedTerm = this.highlightMatch(result.term, query);
            return `
                <div class="autocomplete-item" data-index="${index}" data-id="${result.id}">
                    <span class="term">${highlightedTerm}</span>
                    <span class="lang">${result.lang}</span>
                </div>
            `;
        }).join('');

        this.dropdown.innerHTML = html;

        // Add click handlers to items
        this.dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index, 10);
                this.selectedIndex = index;
                this.selectCurrent();
            });

            item.addEventListener('mouseenter', () => {
                this.setSelection(parseInt(item.dataset.index, 10));
            });
        });

        this.open();
    }

    /**
     * Highlight the matching part of the term
     * @param {string} term - The full term
     * @param {string} query - The search query
     * @returns {string} - HTML with highlighted match
     */
    highlightMatch(term, query) {
        if (!query) return this.escapeHtml(term);

        const lowerTerm = term.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const matchIndex = lowerTerm.indexOf(lowerQuery);

        if (matchIndex === -1) {
            return this.escapeHtml(term);
        }

        const before = term.slice(0, matchIndex);
        const match = term.slice(matchIndex, matchIndex + query.length);
        const after = term.slice(matchIndex + query.length);

        return `${this.escapeHtml(before)}<strong>${this.escapeHtml(match)}</strong>${this.escapeHtml(after)}`;
    }

    /**
     * Escape HTML special characters
     * @param {string} str - String to escape
     * @returns {string}
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Move selection up or down
     * @param {number} delta - Direction (+1 for down, -1 for up)
     */
    moveSelection(delta) {
        const newIndex = this.selectedIndex + delta;

        if (newIndex >= -1 && newIndex < this.results.length) {
            this.setSelection(newIndex);
        }
    }

    /**
     * Set the selected index and update UI
     * @param {number} index - New selection index
     */
    setSelection(index) {
        // Remove previous selection
        const prevSelected = this.dropdown.querySelector('.autocomplete-item.selected');
        if (prevSelected) {
            prevSelected.classList.remove('selected');
        }

        this.selectedIndex = index;

        // Add new selection
        if (index >= 0) {
            const items = this.dropdown.querySelectorAll('.autocomplete-item');
            if (items[index]) {
                items[index].classList.add('selected');
                // Scroll into view if needed
                items[index].scrollIntoView({ block: 'nearest' });
            }
        }
    }

    /**
     * Select the currently highlighted item
     */
    selectCurrent() {
        if (this.selectedIndex >= 0 && this.selectedIndex < this.results.length) {
            const selected = this.results[this.selectedIndex];
            this.onSelect(selected);
            this.close();
        }
    }

    /**
     * Open the dropdown
     */
    open() {
        this.dropdown.classList.add('active');
        this.isOpen = true;
    }

    /**
     * Close the dropdown
     */
    close() {
        this.dropdown.classList.remove('active');
        this.isOpen = false;
        this.selectedIndex = -1;
    }

    /**
     * Clear the input and close dropdown
     */
    clear() {
        this.input.value = '';
        this.results = [];
        this.close();
    }

    /**
     * Set input value without triggering search
     * @param {string} value - Value to set
     */
    setValue(value) {
        this.input.value = value;
    }
}
