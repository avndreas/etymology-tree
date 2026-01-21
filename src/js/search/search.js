/**
 * Search functionality - handles autocomplete queries with debouncing
 */
import { searchTerms } from '../db/database.js';

/**
 * Create a debounced function that delays execution
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function}
 */
function debounce(fn, delay) {
    let timeoutId = null;
    return (...args) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delay);
    };
}

/**
 * Search controller - manages search state and callbacks
 */
export class Search {
    constructor(options = {}) {
        this.debounceDelay = options.debounceDelay || 300;
        this.maxResults = options.maxResults || 50;
        this.minQueryLength = options.minQueryLength || 1;

        // Callbacks
        this.onResults = options.onResults || (() => {});
        this.onSelect = options.onSelect || (() => {});
        this.onClear = options.onClear || (() => {});

        // Current state
        this.currentQuery = '';
        this.results = [];

        // Create debounced search function
        this.debouncedSearch = debounce((query) => {
            this.executeSearch(query);
        }, this.debounceDelay);
    }

    /**
     * Handle input change - called on each keystroke
     * @param {string} query - The search query
     */
    handleInput(query) {
        this.currentQuery = query.trim();

        if (this.currentQuery.length < this.minQueryLength) {
            this.results = [];
            this.onClear();
            return;
        }

        // Trigger debounced search
        this.debouncedSearch(this.currentQuery);
    }

    /**
     * Execute the actual search query
     * @param {string} query - The search query
     */
    executeSearch(query) {
        // Don't search if query changed while debouncing
        if (query !== this.currentQuery) return;

        try {
            this.results = searchTerms(query, this.maxResults);
            this.onResults(this.results, query);
        } catch (error) {
            console.error('Search error:', error);
            this.results = [];
            this.onClear();
        }
    }

    /**
     * Select a result by index
     * @param {number} index - Index of the result to select
     */
    selectResult(index) {
        if (index >= 0 && index < this.results.length) {
            const selected = this.results[index];
            this.onSelect(selected);
            this.clear();
        }
    }

    /**
     * Select a result by ID
     * @param {string} id - ID of the term to select
     */
    selectById(id) {
        const selected = this.results.find(r => r.id === id);
        if (selected) {
            this.onSelect(selected);
            this.clear();
        }
    }

    /**
     * Clear search state
     */
    clear() {
        this.currentQuery = '';
        this.results = [];
        this.onClear();
    }

    /**
     * Get current results
     * @returns {Array}
     */
    getResults() {
        return this.results;
    }
}
