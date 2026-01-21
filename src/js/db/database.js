/**
 * Database layer - handles SQLite loading and queries via sql.js
 *
 * This module:
 * 1. Loads the sql.js WASM engine
 * 2. Fetches and opens the etymology database
 * 3. Caches the database in IndexedDB for fast subsequent loads
 * 4. Provides query functions for search and tree building
 */
import initSqlJs from 'sql.js';

// Database singleton
let db = null;
let SQL = null;

// IndexedDB cache config
const DB_CACHE_NAME = 'etymology-db-cache';
const DB_CACHE_KEY = 'etymology.db';
const DB_VERSION = 1;

/**
 * Initialize the database
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Promise<void>}
 */
export async function initDatabase(onProgress = () => {}) {
    if (db) return; // Already initialized

    onProgress('Loading SQL engine...');

    // Initialize sql.js with the WASM binary
    SQL = await initSqlJs({
        locateFile: file => `/${file}`  // WASM file is in public folder
    });

    onProgress('Checking cache...');

    // Try to load from IndexedDB cache first
    let dbData = await loadFromCache();

    if (dbData) {
        onProgress('Loading from cache...');
    } else {
        onProgress('Downloading database (this may take a while)...');

        // Fetch the database file
        const response = await fetch('/etymology.db');

        if (!response.ok) {
            throw new Error(`Failed to fetch database: ${response.status}`);
        }

        // Get total size for progress
        const contentLength = response.headers.get('Content-Length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        // Read the response as an ArrayBuffer with progress tracking
        if (total > 0) {
            dbData = await readWithProgress(response, total, onProgress);
        } else {
            dbData = await response.arrayBuffer();
        }

        // Cache for next time
        onProgress('Caching database...');
        await saveToCache(dbData);
    }

    onProgress('Opening database...');

    // Open the database
    db = new SQL.Database(new Uint8Array(dbData));

    onProgress('Ready!');
}

/**
 * Read a fetch response with progress tracking
 */
async function readWithProgress(response, total, onProgress) {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        received += value.length;

        const percent = Math.round((received / total) * 100);
        onProgress(`Downloading database... ${percent}%`);
    }

    // Combine chunks into a single ArrayBuffer
    const combined = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
    }

    return combined.buffer;
}

/**
 * Load database from IndexedDB cache
 * @returns {Promise<ArrayBuffer|null>}
 */
async function loadFromCache() {
    return new Promise((resolve) => {
        const request = indexedDB.open(DB_CACHE_NAME, DB_VERSION);

        request.onerror = () => resolve(null);

        request.onupgradeneeded = (event) => {
            const idb = event.target.result;
            if (!idb.objectStoreNames.contains('databases')) {
                idb.createObjectStore('databases');
            }
        };

        request.onsuccess = (event) => {
            const idb = event.target.result;
            const transaction = idb.transaction('databases', 'readonly');
            const store = transaction.objectStore('databases');
            const getRequest = store.get(DB_CACHE_KEY);

            getRequest.onerror = () => resolve(null);
            getRequest.onsuccess = () => resolve(getRequest.result || null);
        };
    });
}

/**
 * Save database to IndexedDB cache
 * @param {ArrayBuffer} data
 * @returns {Promise<void>}
 */
async function saveToCache(data) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_CACHE_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onupgradeneeded = (event) => {
            const idb = event.target.result;
            if (!idb.objectStoreNames.contains('databases')) {
                idb.createObjectStore('databases');
            }
        };

        request.onsuccess = (event) => {
            const idb = event.target.result;
            const transaction = idb.transaction('databases', 'readwrite');
            const store = transaction.objectStore('databases');
            store.put(data, DB_CACHE_KEY);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        };
    });
}

/**
 * Search for terms matching a query (for autocomplete)
 * @param {string} query - Search string
 * @param {number} limit - Max results to return
 * @returns {Array<{id: string, lang: string, term: string}>}
 */
export function searchTerms(query, limit = 50) {
    if (!db) throw new Error('Database not initialized');
    if (!query || query.length < 1) return [];

    // Use LIKE for prefix matching, case-insensitive
    const stmt = db.prepare(`
        SELECT id, lang, term
        FROM terms
        WHERE term LIKE ? COLLATE NOCASE
        ORDER BY
            CASE WHEN term = ? COLLATE NOCASE THEN 0 ELSE 1 END,
            length(term),
            term COLLATE NOCASE
        LIMIT ?
    `);

    stmt.bind([`${query}%`, query, limit]);

    const results = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push(row);
    }
    stmt.free();

    return results;
}

/**
 * Get a term by its ID
 * @param {string} id - Term ID
 * @returns {{id: string, lang: string, term: string}|null}
 */
export function getTermById(id) {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare('SELECT id, lang, term FROM terms WHERE id = ?');
    stmt.bind([id]);

    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();

    return result;
}

/**
 * Get all relationships for a term (etymology sources)
 * @param {string} termId - The term ID to get relationships for
 * @returns {Array<{from_id: string, to_id: string, reltype: string, position: number, group_tag: string, parent_tag: string}>}
 */
export function getRelationships(termId) {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare(`
        SELECT from_id, to_id, reltype, position, group_tag, parent_tag, parent_position
        FROM relationships
        WHERE from_id = ?
        ORDER BY position
    `);

    stmt.bind([termId]);

    const results = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push(row);
    }
    stmt.free();

    return results;
}

/**
 * Get terms that reference a given term (reverse lookup for "related words")
 * @param {string} termId - The term ID to find references to
 * @param {number} limit - Max results
 * @returns {Array<{id: string, lang: string, term: string, reltype: string}>}
 */
export function getTermsReferencingId(termId, limit = 50) {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare(`
        SELECT DISTINCT t.id, t.lang, t.term, r.reltype
        FROM terms t
        JOIN relationships r ON t.id = r.from_id
        WHERE r.to_id = ?
        ORDER BY t.term COLLATE NOCASE
        LIMIT ?
    `);

    stmt.bind([termId, limit]);

    const results = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push(row);
    }
    stmt.free();

    return results;
}

/**
 * Check if database is initialized
 * @returns {boolean}
 */
export function isInitialized() {
    return db !== null;
}

/**
 * Get database statistics (for debugging)
 * @returns {{termCount: number, relationshipCount: number}}
 */
export function getStats() {
    if (!db) throw new Error('Database not initialized');

    const termCount = db.exec('SELECT COUNT(*) FROM terms')[0].values[0][0];
    const relCount = db.exec('SELECT COUNT(*) FROM relationships')[0].values[0][0];

    return {
        termCount,
        relationshipCount: relCount
    };
}
