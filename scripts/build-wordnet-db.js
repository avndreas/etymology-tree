/**
 * Convert WordNet text files to SQLite database
 * Parses data.noun, data.verb, data.adj, data.adv files
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const WORDNET_DIR = path.join(__dirname, '..', 'Data', 'dict');
const OUTPUT_DB = path.join(__dirname, '..', 'Data', 'wordnet.db');

// POS mapping
const POS_MAP = {
    'n': 'noun',
    'v': 'verb',
    'a': 'adjective',
    's': 'adjective satellite',
    'r': 'adverb'
};

// Files to process
const DATA_FILES = [
    { file: 'data.noun', pos: 'n' },
    { file: 'data.verb', pos: 'v' },
    { file: 'data.adj', pos: 'a' },
    { file: 'data.adv', pos: 'r' }
];

/**
 * Parse a single WordNet data line
 * Format: synset_offset lex_filenum ss_type w_cnt word lex_id [word lex_id...] p_cnt [ptr...] [frames...] | gloss
 */
function parseDataLine(line) {
    // Skip license header lines
    if (line.startsWith('  ')) return null;

    const glossSplit = line.split(' | ');
    if (glossSplit.length < 2) return null;

    const definition = glossSplit.slice(1).join(' | ').trim();
    const dataPart = glossSplit[0];
    const parts = dataPart.split(' ');

    if (parts.length < 4) return null;

    const synsetOffset = parts[0];
    const pos = parts[2];
    const wordCount = parseInt(parts[3], 16); // Word count is in hex

    // Extract words (they come after word count, each followed by lex_id)
    const words = [];
    let idx = 4;
    for (let i = 0; i < wordCount && idx < parts.length; i++) {
        const word = parts[idx].replace(/_/g, ' '); // WordNet uses _ for spaces
        words.push(word);
        idx += 2; // Skip lex_id
    }

    return {
        synsetId: `${synsetOffset}-${pos}`,
        pos: POS_MAP[pos] || pos,
        words,
        definition
    };
}

/**
 * Process a WordNet data file
 */
function processDataFile(filePath, pos) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const entries = [];

    for (const line of lines) {
        const parsed = parseDataLine(line);
        if (parsed) {
            entries.push(parsed);
        }
    }

    return entries;
}

async function main() {
    console.log('Building WordNet SQLite database...');

    // Remove existing DB if present
    if (fs.existsSync(OUTPUT_DB)) {
        fs.unlinkSync(OUTPUT_DB);
    }

    const db = new Database(OUTPUT_DB);

    // Create tables
    db.exec(`
        CREATE TABLE synsets (
            id TEXT PRIMARY KEY,
            pos TEXT NOT NULL,
            definition TEXT NOT NULL
        );

        CREATE TABLE words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            synset_id TEXT NOT NULL,
            FOREIGN KEY (synset_id) REFERENCES synsets(id)
        );

        CREATE INDEX idx_words_word ON words(word COLLATE NOCASE);
        CREATE INDEX idx_words_synset ON words(synset_id);
    `);

    const insertSynset = db.prepare('INSERT OR IGNORE INTO synsets (id, pos, definition) VALUES (?, ?, ?)');
    const insertWord = db.prepare('INSERT INTO words (word, synset_id) VALUES (?, ?)');

    let totalSynsets = 0;
    let totalWords = 0;

    // Process each data file
    for (const { file, pos } of DATA_FILES) {
        const filePath = path.join(WORDNET_DIR, file);

        if (!fs.existsSync(filePath)) {
            console.warn(`Warning: ${file} not found, skipping...`);
            continue;
        }

        console.log(`Processing ${file}...`);
        const entries = processDataFile(filePath, pos);

        // Insert in a transaction for speed
        const insertMany = db.transaction((entries) => {
            for (const entry of entries) {
                insertSynset.run(entry.synsetId, entry.pos, entry.definition);
                totalSynsets++;

                for (const word of entry.words) {
                    insertWord.run(word, entry.synsetId);
                    totalWords++;
                }
            }
        });

        insertMany(entries);
        console.log(`  Added ${entries.length} synsets`);
    }

    db.close();

    // Get file size
    const stats = fs.statSync(OUTPUT_DB);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`\nDone! Created ${OUTPUT_DB}`);
    console.log(`  Total synsets: ${totalSynsets}`);
    console.log(`  Total word entries: ${totalWords}`);
    console.log(`  Database size: ${sizeMB} MB`);
}

main().catch(console.error);
