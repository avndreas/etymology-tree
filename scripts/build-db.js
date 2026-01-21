// ============================================================================
// CSV to SQLite Database Converter
// ============================================================================
// This script converts the etymology.csv file (436 MB, 4.2M rows) into a
// fast, queryable SQLite database with normalized schema and indexes.
//
// Process:
// 1. Read CSV file line-by-line (streaming, not all at once)
// 2. Extract unique terms and insert into 'terms' table
// 3. Extract relationships and insert into 'relationships' table
// 4. Build indexes for fast searching
// ============================================================================

const Database = require('better-sqlite3');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const CSV_PATH = path.join(__dirname, '../Data/etymology.csv');
const DB_PATH = path.join(__dirname, '../Data/etymology.db');

// For testing with a small subset (set to 0 to process all rows)
const LIMIT_ROWS = 1000; // Start with 1000 rows to test, then set to 0 for full run

console.log('Etymology Database Builder');
console.log('==========================');
console.log(`CSV Input:  ${CSV_PATH}`);
console.log(`DB Output:  ${DB_PATH}`);
console.log(`Row Limit:  ${LIMIT_ROWS === 0 ? 'None (full dataset)' : LIMIT_ROWS}`);
console.log('');

// ============================================================================
// Part 2: Create Database Schema
// ============================================================================

// Delete old database if it exists
if (fs.existsSync(DB_PATH)) {
    console.log('Deleting old database...');
    fs.unlinkSync(DB_PATH);
}

// Create new SQLite database
console.log('Creating new database...');
const db = new Database(DB_PATH);

// Enable Write-Ahead Logging (WAL) for better performance
// WAL allows reads and writes to happen concurrently
db.pragma('journal_mode = WAL');

// Create the schema
console.log('Creating schema...');

// Terms table: Stores each unique word/term once
db.exec(`
    CREATE TABLE terms (
        id TEXT PRIMARY KEY,        -- Unique term_id from CSV
        lang TEXT NOT NULL,         -- Language (e.g., "English", "Latin")
        term TEXT NOT NULL          -- The actual word/term
    );
`);

// Relationships table: Stores connections between terms
db.exec(`
    CREATE TABLE relationships (
        from_id TEXT NOT NULL,       -- Source term_id
        to_id TEXT,                  -- Target term_id (can be NULL for group markers)
        reltype TEXT NOT NULL,       -- Relationship type (e.g., "borrowed_from")
        position INTEGER NOT NULL,   -- Order position (from CSV)
        group_tag TEXT,              -- Group identifier for hierarchical grouping
        parent_tag TEXT,             -- Parent group tag
        parent_position INTEGER,     -- Position within parent group

        FOREIGN KEY (from_id) REFERENCES terms(id),
        FOREIGN KEY (to_id) REFERENCES terms(id)
    );
`);

console.log('✓ Schema created');
console.log('');

// ============================================================================
// Part 3: Prepare Insert Statements
// ============================================================================

// Prepared statements are pre-compiled SQL queries that run faster
// and protect against SQL injection

// INSERT OR IGNORE means: insert if doesn't exist, skip if it does
// This handles duplicate terms (same word appears in multiple CSV rows)
const insertTerm = db.prepare(`
    INSERT OR IGNORE INTO terms (id, lang, term)
    VALUES (?, ?, ?)
`);

const insertRelationship = db.prepare(`
    INSERT INTO relationships (from_id, to_id, reltype, position, group_tag, parent_tag, parent_position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// ============================================================================
// Part 4: Parse CSV and Insert Data
// ============================================================================

console.log('Reading CSV and inserting data...');
console.log('This may take several minutes for the full dataset.');
console.log('');

let rowCount = 0;
let termCount = 0;
let relCount = 0;

// Use a transaction for much faster bulk inserts
// Without transaction: ~100 inserts/second
// With transaction: ~50,000 inserts/second
const insertMany = db.transaction((rows) => {
    for (const row of rows) {
        // Insert the source term (from the current row)
        const termResult = insertTerm.run(row.term_id, row.lang, row.term);
        if (termResult.changes > 0) {
            termCount++; // Count only new insertions
        }

        // Insert the related term if it exists
        if (row.related_term_id && row.related_term) {
            const relatedResult = insertTerm.run(
                row.related_term_id,
                row.related_lang,
                row.related_term
            );
            if (relatedResult.changes > 0) {
                termCount++;
            }
        }

        // Insert the relationship
        insertRelationship.run(
            row.term_id,
            row.related_term_id || null,
            row.reltype,
            parseInt(row.position) || 0,
            row.group_tag || null,
            row.parent_tag || null,
            parseInt(row.parent_position) || null
        );
        relCount++;
    }
});

// Read CSV in chunks for memory efficiency
const CHUNK_SIZE = 1000; // Process 1000 rows at a time
let chunk = [];

// Save reference to the stream so we can stop it early if needed
const stream = fs.createReadStream(CSV_PATH)
    .pipe(csv())
    .on('data', (row) => {
        rowCount++;

        // Add row to current chunk
        chunk.push(row);

        // When chunk is full, insert it
        if (chunk.length >= CHUNK_SIZE) {
            insertMany(chunk);
            chunk = [];

            // Show progress every 10,000 rows
            if (rowCount % 10000 === 0) {
                console.log(`  Processed ${rowCount.toLocaleString()} rows...`);
            }
        }

        // Stop early if testing with limited rows
        if (LIMIT_ROWS > 0 && rowCount >= LIMIT_ROWS) {
            stream.destroy(); // Stop reading CSV
        }
    })
    .on('end', () => {
        // Insert any remaining rows in the last chunk
        if (chunk.length > 0) {
            insertMany(chunk);
        }

        console.log('');
        console.log('✓ Data insertion complete');
        console.log(`  Rows processed: ${rowCount.toLocaleString()}`);
        console.log(`  Unique terms:   ${termCount.toLocaleString()}`);
        console.log(`  Relationships:  ${relCount.toLocaleString()}`);
        console.log('');

        // Continue to Part 5: Create Indexes
        createIndexes();
    })
    .on('error', (error) => {
        console.error('Error reading CSV:', error);
        process.exit(1);
    });

// ============================================================================
// Part 5: Create Indexes for Fast Queries
// ============================================================================

function createIndexes() {
    console.log('Creating indexes...');
    console.log('This will take a few minutes but makes searches 1000x faster.');
    console.log('');

    // Index on term (case-insensitive) for autocomplete search
    console.log('  Creating idx_terms_term...');
    db.exec('CREATE INDEX idx_terms_term ON terms(term COLLATE NOCASE)');

    // Index on language + term for filtered searches
    console.log('  Creating idx_terms_lang_term...');
    db.exec('CREATE INDEX idx_terms_lang_term ON terms(lang, term)');

    // Index on from_id for finding all relationships of a term
    console.log('  Creating idx_rel_from...');
    db.exec('CREATE INDEX idx_rel_from ON relationships(from_id, position)');

    // Index on to_id for finding all terms that relate to this term
    console.log('  Creating idx_rel_to...');
    db.exec('CREATE INDEX idx_rel_to ON relationships(to_id)');

    console.log('');
    console.log('✓ Indexes created');
    console.log('');

    // Show final statistics
    showStats();
}

// ============================================================================
// Part 6: Display Statistics
// ============================================================================

function showStats() {
    console.log('Database Statistics:');
    console.log('====================');

    const termCountRow = db.prepare('SELECT COUNT(*) as count FROM terms').get();
    console.log(`Terms:         ${termCountRow.count.toLocaleString()}`);

    const relCountRow = db.prepare('SELECT COUNT(*) as count FROM relationships').get();
    console.log(`Relationships: ${relCountRow.count.toLocaleString()}`);

    const langCountRow = db.prepare('SELECT COUNT(DISTINCT lang) as count FROM terms').get();
    console.log(`Languages:     ${langCountRow.count.toLocaleString()}`);

    // Show database file size
    const stats = fs.statSync(DB_PATH);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`File size:     ${sizeMB} MB`);

    console.log('');
    console.log('✓ Database build complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Test some queries (see below)');
    console.log('2. If testing with limited rows, set LIMIT_ROWS = 0 and run again');
    console.log('3. Compress database: npm run compress-db');
    console.log('');
    console.log('Example test query:');
    console.log('  node -e "const db = require(\'better-sqlite3\')(\'Data/etymology.db\'); console.log(db.prepare(\'SELECT * FROM terms LIMIT 10\').all())"');

    db.close();
}
