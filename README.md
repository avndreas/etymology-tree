# Etymology Visualization

An interactive etymology visualization tool that displays word origins as tree diagrams on an infinite scrollable/zoomable canvas.

Etymology database sourced from [etymology-db](https://github.com/droher/etymology-db)

## Getting Started

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/avndreas/etymology.git
   cd etymology
   npm install
   ```

2. Download the database files from the [latest release](https://github.com/avndreas/etymology/releases/latest) and place them in the `public/` folder:
   - `etymology.db.xz` → `public/etymology.db.xz`
   - `wordnet.db.xz` → `public/wordnet.db.xz`

   Then decompress them:
   ```bash
   # On Mac/Linux
   unxz -k public/etymology.db.xz
   unxz -k public/wordnet.db.xz

   # On Windows — use 7-Zip to extract the .xz files into public/
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Usage

### Searching for Words

1. Type any word in any language in the search bar
2. Select from the autocomplete dropdown
3. The etymology tree will appear on the canvas

### Interacting with the Canvas

- **Pan**: Click and drag empty space
- **Zoom**: Use mouse wheel (or pinch on touch devices)
- **Move trees**: Click and drag individual nodes
- **Click nodes**: Click any node to see related words

### Related Words Modal

- Click any node to open the modal
- See all words that reference this word in their etymology
- Search within results to filter
- Click any result to add that word's tree to the canvas

## Project Structure

```
etymology/
├── Data/
│   ├── etymology.csv           # Original CSV data
│   ├── etymology.db            # SQLite database (generated)
│   └── etymology.db.gz         # Compressed for production
├── public/                     # Static assets served by Vite
│   └── etymology.db.gz         # Database file for client
├── src/
│   ├── index.html             # Main HTML file
│   ├── styles/
│   │   ├── main.css           # Global styles + beige grid theme
│   │   ├── search.css         # Autocomplete dropdown styles
│   │   └── modal.css          # Related words modal styles
│   └── js/
│       ├── main.js            # App initialization & integration
│       ├── db/
│       │   └── database.js    # SQLite queries (sql.js)
│       ├── canvas/
│       │   ├── renderer.js    # Canvas rendering engine
│       │   ├── viewport.js    # Pan/zoom controller
│       │   └── interaction.js # Mouse/touch event handlers
│       ├── tree/
│       │   ├── builder.js     # Build tree from database
│       │   └── layout.js      # Reingold-Tilford layout algorithm
│       ├── search/
│       │   ├── search.js      # Search logic with debouncing
│       │   └── ui.js          # Autocomplete UI components
│       └── ui/
│           └── modal.js       # Related words modal
├── scripts/
│   └── build-db.js            # CSV to SQLite converter
├── package.json
├── vite.config.js
└── README.md
```

## Technical Details

### Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+)
- **Canvas**: Native Canvas 2D API
- **Database**: SQLite with sql.js (WebAssembly)
- **Build Tool**: Vite
- **Styling**: CSS3 with custom theme

### Database Schema

**terms table**:
- `id` (TEXT, PRIMARY KEY) - Unique term identifier
- `term` (TEXT) - The word/term
- `lang` (TEXT) - Language code

**relationships table**:
- `from_id` (TEXT) - Source term ID
- `to_id` (TEXT) - Target term ID (etymology)
- `reltype` (TEXT) - Relationship type (e.g., "borrowed_from", "derived_from")
- `position`, `group_tag`, `parent_tag`, `parent_position` - Hierarchy data


### Performance

Mostly TBD, initial load time before caching is ~20s

