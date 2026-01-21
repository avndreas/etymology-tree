# Etymology Visualization Website - Implementation Plan

## Overview
Build a fast, barebones etymology visualization website that displays word etymologies as interactive tree diagrams on an infinite scrollable/zoomable plane.

**Two-Phase Development Strategy:**
- **Phase A (Now)**: Client-side implementation with sql.js - Simple, no server, perfect for learning
- **Phase B (Optional Future)**: Add backend API option - Better performance for mobile/production use

## Tech Stack

### Phase A: Client-Side (Current Implementation)
- **Frontend**: Vanilla HTML5 + CSS3 + JavaScript (ES6+)
- **Canvas**: Native Canvas API (zero dependencies)
- **Database**: SQLite with sql.js (client-side WASM SQLite)
- **Build Tool**: Vite (minimal, fast dev server)
- **Deployment**: Static files (GitHub Pages, Netlify - free)

**Rationale for client-side approach:**
- **Learning focus**: Simple architecture, no server complexity
- **Zero cost**: Free hosting, no backend infrastructure
- **Offline-first**: Works 100% offline after initial load
- **Fast queries**: <10ms searches with indexed SQLite
- **Trade-off**: 130 MB initial download (may struggle on mobile/slow connections)

**Performance Reality:**
- Desktop (good connection): ~20 second initial load, instant after caching
- Mobile: May be slow or crash on low-end devices (130 MB gzipped DB)
- Subsequent visits: <1 second (IndexedDB cache)

### Phase B: Backend API (Future Migration Path)
When/if needed for production or mobile optimization:

- **Backend**: Node.js + Express + better-sqlite3
- **API**: REST endpoints for search/tree queries
- **Client**: Same UI, ~50 KB download instead of 130 MB
- **Deployment**: $5-20/month hosting (Railway, Render, DigitalOcean)

**Migration Strategy:**
- Same SQLite database file (no data conversion)
- Add abstraction layer in [src/js/db/database.js](src/js/db/database.js)
- Environment variable switches between local/API mode
- ~2-3 hours of work to migrate

## Project Structure
```
etymology/
├── Data/
│   ├── etymology.csv           # Original 436 MB CSV
│   ├── etymology.db            # SQLite database (generated)
│   └── etymology.db.gz         # Compressed for production
├── src/
│   ├── index.html
│   ├── styles/
│   │   ├── main.css            # Global + beige grid theme
│   │   ├── search.css
│   │   └── modal.css
│   ├── js/
│   │   ├── main.js             # App initialization
│   │   ├── db/
│   │   │   ├── database.js     # SQLite queries
│   │   │   └── schema.js       # DB schema definition
│   │   ├── canvas/
│   │   │   ├── viewport.js     # Pan/zoom controller
│   │   │   ├── renderer.js     # Tree rendering
│   │   │   └── interaction.js  # Mouse/drag handlers
│   │   ├── tree/
│   │   │   ├── builder.js      # Build tree from DB
│   │   │   └── layout.js       # Reingold-Tilford layout
│   │   ├── search/
│   │   │   ├── search.js       # Search + autocomplete
│   │   │   └── ui.js           # Search UI components
│   │   └── ui/
│   │       └── modal.js        # Related words modal
│   └── assets/
│       └── sql-wasm.wasm
├── scripts/
│   └── build-db.js             # CSV → SQLite converter
├── package.json
└── vite.config.js
```

## Database Schema

### Tables
```sql
-- Terms table
CREATE TABLE terms (
    id TEXT PRIMARY KEY,        -- term_id
    lang TEXT NOT NULL,         -- Language
    term TEXT NOT NULL          -- Word/term
);

-- Relationships table (DAG edges)
CREATE TABLE relationships (
    from_id TEXT NOT NULL,
    to_id TEXT,
    reltype TEXT NOT NULL,      -- borrowed_from, derived_from, etc.
    position INTEGER NOT NULL,
    group_tag TEXT,
    parent_tag TEXT,
    parent_position INTEGER,
    FOREIGN KEY (from_id) REFERENCES terms(id),
    FOREIGN KEY (to_id) REFERENCES terms(id)
);

-- Indexes for fast queries
CREATE INDEX idx_terms_term ON terms(term COLLATE NOCASE);
CREATE INDEX idx_terms_lang_term ON terms(lang, term);
CREATE INDEX idx_rel_from ON relationships(from_id, position);
CREATE INDEX idx_rel_to ON relationships(to_id);
```

## Implementation Phases

### Phase 1: Database Setup (Days 1-2)
**Goal**: Convert CSV to SQLite database

1. **Set up Node.js project**
   - `npm init -y`
   - Install: `better-sqlite3`, `csv-parser`, `vite`

2. **Create [scripts/build-db.js](scripts/build-db.js)**
   - Parse [Data/etymology.csv](Data/etymology.csv)
   - Create normalized schema (terms + relationships tables)
   - Build indexes
   - Test with subset first (1000 rows), then full dataset

3. **Verify database**
   - Check file size (~300-350 MB expected)
   - Test sample queries
   - Compress with gzip → [Data/etymology.db.gz](Data/etymology.db.gz)

### Phase 2: Basic Canvas + UI (Days 3-4)
**Goal**: Set up HTML structure and canvas rendering

4. **Create [src/index.html](src/index.html)**
   - Search bar at top
   - Full-screen canvas element
   - Loading indicator
   - Modal container for related words

5. **Create [src/styles/main.css](src/styles/main.css)**
   - Beige grid background pattern
   - Old-fashioned styling
   - Responsive layout

6. **Initialize canvas ([src/js/canvas/renderer.js](src/js/canvas/renderer.js))**
   - Set up Canvas 2D context
   - Draw simple test shapes
   - Implement clear and redraw loop

### Phase 3: Data Layer (Days 5-6)
**Goal**: Load database and query etymology data

7. **Create [src/js/db/database.js](src/js/db/database.js)**
   - Initialize sql.js WASM
   - Load `.db.gz` from server
   - Decompress and cache in IndexedDB
   - Implement query functions:
     - `searchTerms(query, limit)` - Autocomplete search
     - `getTermById(id)` - Get term details
     - `getRelationships(termId)` - Get all edges from term

8. **Create [src/js/tree/builder.js](src/js/tree/builder.js)**
   - Implement DAG traversal with cycle detection
   - Build tree structure recursively
   - Handle group hierarchies (group_tag, parent_tag)
   - Limit depth to 10 levels max
   - Return nested tree object:
     ```js
     {
       id: "...",
       lang: "English",
       term: "portmanteau",
       children: [
         { id: "...", term: "*per-", reltype: "has_root", children: [] },
         { id: "...", term: "portemanteau", reltype: "borrowed_from", children: [...] }
       ]
     }
     ```

### Phase 4: Tree Layout & Rendering (Days 7-8)
**Goal**: Visualize etymology trees on canvas

9. **Create [src/js/tree/layout.js](src/js/tree/layout.js)**
   - Implement Reingold-Tilford algorithm
   - Assign x,y coordinates to each node
   - Calculate edge paths (straight lines or curves)
   - Support horizontal orientation (root left, branches right)

10. **Enhance [src/js/canvas/renderer.js](src/js/canvas/renderer.js)**
    - Draw nodes as circles/rectangles with term labels
    - Draw edges as lines with relationship type labels
    - Apply viewport transform (pan/zoom)
    - Implement culling (only render visible nodes)
    - Style with old-fashioned beige theme

### Phase 5: Viewport Controls (Days 9-10)
**Goal**: Infinite scrollable/zoomable plane

11. **Create [src/js/canvas/viewport.js](src/js/canvas/viewport.js)**
    - Manage camera state: `{x, y, zoom}`
    - Transform world coords ↔ screen coords
    - Pan: drag empty space updates viewport position
    - Zoom: mouse wheel updates zoom level
    - Smooth transitions with requestAnimationFrame

12. **Create [src/js/canvas/interaction.js](src/js/canvas/interaction.js)**
    - Mouse event listeners (mousedown, mousemove, mouseup, wheel)
    - Detect clicks on nodes (hit testing)
    - Drag individual trees (update tree root position)
    - Differentiate pan vs drag vs click

### Phase 6: Search Functionality (Days 11-12)
**Goal**: Search any language, display results

13. **Create [src/js/search/search.js](src/js/search/search.js)**
    - Debounced autocomplete (300ms delay)
    - Query database: `SELECT * FROM terms WHERE term LIKE ? LIMIT 50`
    - Display language alongside term (e.g., "encyclopaedia (Latin)")
    - On selection: build tree and add to canvas

14. **Create [src/js/search/ui.js](src/js/search/ui.js)**
    - Render autocomplete dropdown
    - Keyboard navigation (arrow keys, enter)
    - Highlight matching text

### Phase 7: Related Words Modal (Days 13-14)
**Goal**: Click nodes to see related words

15. **Create [src/js/ui/modal.js](src/js/ui/modal.js)**
    - Show modal when node clicked
    - Query: Get all terms that reference this term_id in relationships.to_id
    - Display top 50 results initially
    - Add searchbar within modal to filter all results
    - Scrollable list with term + language
    - Click term to add new tree to canvas

16. **Style [src/styles/modal.css](src/styles/modal.css)**
    - Overlay with semi-transparent background
    - Centered modal box with old-fashioned styling
    - Searchbar and scrollable results list

### Phase 8: Integration & Polish (Days 15-16)
**Goal**: Connect all components and optimize

17. **Create [src/js/main.js](src/js/main.js)**
    - Initialize database (show loading indicator)
    - Set up canvas and viewport
    - Wire up search UI to tree builder
    - Connect interaction handlers to modal
    - Handle errors gracefully

18. **Performance optimizations**
    - Throttle rendering to 60 FPS
    - Cache rendered text (offscreen canvas if needed)
    - Test with multiple large trees
    - Verify memory usage (<500 MB)

19. **Visual polish**
    - Beige grid background with CSS
    - Old-fashioned font (serif)
    - Smooth animations for zoom/pan
    - Loading progress bar for database
    - Error messages with retry button

### Phase 9: Build & Deploy (Day 17)
**Goal**: Production-ready build

20. **Configure [vite.config.js](vite.config.js)**
    - Optimize bundle size
    - Set correct paths for sql.js WASM
    - Enable gzip compression

21. **Create npm scripts in [package.json](package.json)**
    ```json
    {
      "scripts": {
        "build-db": "node scripts/build-db.js",
        "compress-db": "gzip -9 -c Data/etymology.db > Data/etymology.db.gz",
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview"
      }
    }
    ```

22. **Production build**
    - Run full build pipeline
    - Test in production mode
    - Deploy to static hosting (Netlify/Vercel/GitHub Pages)

## Key Algorithms

### Tree Building (DAG Traversal)
```javascript
function buildEtymologyTree(termId, maxDepth = 10, visited = new Set()) {
    if (visited.has(termId) || maxDepth === 0) return null;
    visited.add(termId);

    const term = db.getTermById(termId);
    const relationships = db.getRelationships(termId);

    const node = { id: termId, ...term, children: [] };

    for (const rel of relationships.sort(byGroupHierarchy)) {
        if (rel.to_id) {
            const child = buildEtymologyTree(rel.to_id, maxDepth - 1, visited);
            if (child) {
                child.reltype = rel.reltype;
                node.children.push(child);
            }
        }
    }
    return node;
}
```

### Viewport Transform
```javascript
function worldToScreen(worldX, worldY, viewport) {
    return {
        x: (worldX - viewport.x) * viewport.zoom + canvas.width / 2,
        y: (worldY - viewport.y) * viewport.zoom + canvas.height / 2
    };
}
```

## Critical Files (Implementation Order)
1. **[scripts/build-db.js](scripts/build-db.js)** - Unlocks all data access
2. **[src/js/db/database.js](src/js/db/database.js)** - Core data layer
3. **[src/js/tree/builder.js](src/js/tree/builder.js)** - Transforms data to trees
4. **[src/js/canvas/renderer.js](src/js/canvas/renderer.js)** - Visualizes trees
5. **[src/js/canvas/viewport.js](src/js/canvas/viewport.js)** - Enables interaction

## Verification & Testing

### Unit Testing
- Test tree builder with known terms (e.g., "portmanteau", "encyclopedia")
- Verify cycle detection prevents infinite loops
- Test viewport transform math (world ↔ screen coords)

### Integration Testing
1. **Search flow**: Type "port" → see autocomplete → select "portmanteau" → tree appears
2. **Pan/zoom**: Drag canvas → tree moves; scroll wheel → zoom changes
3. **Drag tree**: Click and drag node → entire tree moves
4. **Related words**: Click "portemanteau" → modal shows French words with same root
5. **Modal search**: Type in modal searchbar → filters results
6. **Multi-language**: Search "ἐγκυκλοπαιδεία" (Greek) → tree displays correctly

### Performance Testing
- Load database: <20s initial, <1s cached
- Search query: <50ms
- Tree building: <100ms for depth-10 tree
- Rendering: 60 FPS with culling
- Memory: <500 MB total

### Browser Compatibility
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (with touch gestures)

## Expected Outcomes
- ✅ Fast, zero-dependency etymology visualization
- ✅ Works offline after initial load (PWA-ready)
- ✅ Handles 4.2M rows and 2,280 languages
- ✅ Smooth 60 FPS pan/zoom interaction
- ✅ Simple deployment (just static files)
- ✅ ~130 MB initial download (compressed DB)

## Future Enhancements

### Phase A Extensions (Client-Side Only)
- Export trees as PNG/SVG
- URL sharing with encoded state
- Filter by relationship type
- Dark mode theme
- Touch gesture support for mobile
- IPA pronunciation tooltips
- PWA with offline support

### Phase B: Backend Migration (When Needed)
**Goal**: Improve mobile performance and reduce initial load

#### Backend Structure (New Files)
```
server/
├── server.js              # Express app
├── routes/
│   ├── search.js          # GET /api/search?q=term
│   ├── terms.js           # GET /api/terms/:id
│   └── relationships.js   # GET /api/relationships/:id
└── db/
    └── connection.js      # SQLite connection pool
```

#### Implementation Steps
1. **Create Express server** (~30 minutes)
   - Install `express`, `cors`, `compression`
   - Set up routes for search, terms, relationships
   - Serve static frontend files

2. **Add API abstraction layer** (~1 hour)
   - Modify [src/js/db/database.js](src/js/db/database.js)
   - Add `USE_API` environment variable
   - Implement `fetch()` calls for API mode
   - Keep sql.js code for local mode

3. **Deploy backend** (~30 minutes)
   - Upload to Railway/Render
   - Configure environment variables
   - Test API endpoints

4. **Update frontend** (~30 minutes)
   - Build with `VITE_USE_API=true`
   - Remove sql.js WASM from bundle
   - Deploy lightweight client (~50 KB)

#### Cost Comparison
- **Client-side (Phase A)**: $0/month (free hosting)
- **Backend (Phase B)**: $5-20/month (includes DB + API)

#### When to Migrate
- Users complain about slow mobile performance
- Want to deploy to production/public use
- Need server-side features (analytics, rate limiting)
- Budget allows for hosting costs
