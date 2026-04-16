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
import LZMA from 'lzma/src/lzma.js';

// Database singletons
let db = null;
let wordnetDb = null;
let SQL = null;

// DB URLs — override via .env.production for hosted builds
const ETYMOLOGY_DB_URL = import.meta.env.VITE_ETYMOLOGY_DB_URL || '/etymology.db';
const WORDNET_DB_URL = import.meta.env.VITE_WORDNET_DB_URL || '/wordnet.db';

// IndexedDB cache config
const DB_CACHE_NAME = 'etymology-db-cache';
const DB_CACHE_KEY = 'etymology.db';
const WORDNET_CACHE_KEY = 'wordnet.db';
const DB_VERSION = 2;

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
        dbData = await fetchDatabase(ETYMOLOGY_DB_URL, onProgress);

        // Cache for next time
        onProgress('Caching database...');
        await saveToCache(dbData);
    }

    onProgress('Opening etymology database...');

    // Open the database
    db = new SQL.Database(new Uint8Array(dbData));

    // Now load WordNet database
    onProgress('Loading WordNet dictionary...');
    await loadWordNetDatabase(onProgress);

    onProgress('Ready!');
}

/**
 * Load the WordNet definitions database
 */
async function loadWordNetDatabase(onProgress) {
    // Try to load from cache first
    let wordnetData = await loadFromCache(WORDNET_CACHE_KEY);

    if (wordnetData) {
        onProgress('Loading WordNet from cache...');
    } else {
        onProgress('Downloading WordNet dictionary...');

        try {
            wordnetData = await fetchDatabase(WORDNET_DB_URL, (msg) => {
                if (msg.includes('%')) {
                    const percent = msg.match(/(\d+)%/)[1];
                    onProgress(`Downloading WordNet dictionary... ${percent}%`);
                }
            });
        } catch {
            console.warn('WordNet database not available, definitions will be disabled');
            return;
        }

        onProgress('Caching WordNet...');
        await saveToCache(wordnetData, WORDNET_CACHE_KEY);
    }

    wordnetDb = new SQL.Database(new Uint8Array(wordnetData));
}

/**
 * Fetch a database file, decompressing gzip on the fly if the URL ends in .gz
 */
async function fetchDatabase(url, onProgress) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch database: ${response.status}`);

    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (url.endsWith('.xz')) {
        const compressed = total > 0
            ? await readWithProgress(response, total, onProgress)
            : await response.arrayBuffer();
        onProgress('Decompressing database...');
        return await new Promise((resolve, reject) => {
            LZMA.decompress(new Uint8Array(compressed), (result, error) => {
                if (error) return reject(new Error(error));
                resolve(new Uint8Array(result).buffer);
            });
        });
    }

    if (total > 0) return await readWithProgress(response, total, onProgress);
    return await response.arrayBuffer();
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
 * @param {string} cacheKey - Key to load from cache
 * @returns {Promise<ArrayBuffer|null>}
 */
async function loadFromCache(cacheKey = DB_CACHE_KEY) {
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
            const getRequest = store.get(cacheKey);

            getRequest.onerror = () => resolve(null);
            getRequest.onsuccess = () => resolve(getRequest.result || null);
        };
    });
}

/**
 * Save database to IndexedDB cache
 * @param {ArrayBuffer} data
 * @param {string} cacheKey - Key to save under
 * @returns {Promise<void>}
 */
async function saveToCache(data, cacheKey = DB_CACHE_KEY) {
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
            store.put(data, cacheKey);

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

/**
 * Get definitions for a word from WordNet
 * Only works for English words
 * @param {string} word - The word to look up
 * @param {string} lang - Language name from etymology database
 * @returns {Array<{pos: string, definition: string}>}
 */
export function getDefinitions(word, lang = '') {
    // WordNet only has English definitions
    // Check for various English language names used in the etymology database
    const englishLangs = ['english', 'american english', 'british english', 'middle english', 'old english', 'scots english'];
    const isEnglish = englishLangs.some(e => lang.toLowerCase().includes(e)) || lang.toLowerCase() === 'en';

    if (!wordnetDb || !isEnglish) return [];

    try {
        const stmt = wordnetDb.prepare(`
            SELECT DISTINCT s.pos, s.definition
            FROM words w
            JOIN synsets s ON w.synset_id = s.id
            WHERE w.word = ? COLLATE NOCASE
            ORDER BY s.pos, length(s.definition)
        `);

        stmt.bind([word]);

        const results = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push(row);
        }
        stmt.free();

        return results;
    } catch (error) {
        console.warn('Error fetching definitions:', error);
        return [];
    }
}

/**
 * Check if WordNet database is available
 * @returns {boolean}
 */
export function hasWordNet() {
    return wordnetDb !== null;
}
