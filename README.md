# Etymology Visualization

An interactive etymology visualization tool that displays word origins as tree diagrams on an infinite scrollable/zoomable canvas.

## Features

- **Multi-language search**: Search for words in any of 2,280+ languages
- **Interactive trees**: Click and drag trees, pan and zoom the canvas
- **Etymology relationships**: Visual display of word origins with relationship types
- **Related words modal**: Click any node to see all words that reference it
- **Old-fashioned design**: Beige grid background with serif fonts
- **Offline-first**: Works completely offline after initial database load

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/avndreas/etymology.git
cd etymology
```

2. Install dependencies:
```bash
npm install
```

3. Build the database (if not already built):
```bash
npm run build-db
```

This will convert `Data/etymology.csv` to `Data/etymology.db`.

4. Place the database file:
   - Copy `Data/etymology.db` to the `public/` directory
   - For production, compress it: `gzip -9 -c Data/etymology.db > public/etymology.db.gz`

### Running in Development

Start the development server:
```bash
npm run dev
```

The app will open at `http://localhost:3000`

### Building for Production

Build the optimized production bundle:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
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
- **Styling**: CSS3 with custom beige theme

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

### Key Algorithms

- **Tree Building**: DAG traversal with cycle detection
- **Layout**: Reingold-Tilford algorithm for clean tree visualization
- **Viewport**: Coordinate transformation for pan/zoom
- **Search**: Debounced autocomplete with LIKE queries

### Performance

- Initial load: ~20 seconds (130 MB database)
- Subsequent loads: <1 second (IndexedDB cache)
- Search queries: <50ms
- Rendering: 60 FPS with viewport culling

## Browser Compatibility

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers with touch support

## License

ISC

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
