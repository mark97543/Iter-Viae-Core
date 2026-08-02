# Iter Viae

> **Way of the Road** — Offline-First Navigation Infrastructure

---

## Roadmap & Versions

### Version 1: Faber (*The Smith*)

Faber is the data preprocessing engine responsible for compiling raw OpenStreetMap data (`.pbf`) into production-ready offline map artifacts.

---

## Directory Architecture

```
Iter Viae Core/
├── tools/
│   └── faber/          # Faber build scripts and tooling
└── data/
    └── maps/
        ├── raw/        # Input: Raw .pbf map extracts (strictly 1 file)
        └── compiled/   # Output: Generated offline map artifacts
```

---

## Faber Pipeline Requirements

- [ ] **Directory Setup**: Create `tools/faber/` and `data/maps/` subdirectories (`raw` and `compiled`).
- [ ] **Faber Automation Script**: Implement a primary Bash script in `tools/faber/` that performs the following:
  - [ ] **User Notifications**: Provide clear CLI progress feedback at each stage of execution.
  - [ ] **Directory Integrity**: Check for required workspace directories (`tools/faber`, `data/maps/raw`, `data/maps/compiled`) and automatically create any missing ones.
  - [ ] **Input Validation**: Check `data/maps/raw/`. Ensure exactly **one** `.pbf` map extract file is present; notify the user and abort if zero or multiple files exist.
  - [ ] **Output Workspace Cleanup**: Purge pre-existing files in `data/maps/compiled/` to ensure only the latest compiled map set is preserved.
  - [ ] **Artifact Compilation**: Process the raw `.pbf` map file into the three core map artifacts and place them in `data/maps/compiled/`.

---

## Compiled Artifact Specifications

### 1. Visual Master Tiles (`.mbtiles`)
- **What it is**: A highly-indexed SQLite database containing compressed vector tile geometry (roads, terrain, water features, basic boundaries).
- **Why we need it**: Rendered locally on-device by MapLibre GL to paint smooth 60fps dark-mode tactical map canvases completely offline.
- **Tooling**: Planetiler or Tilemaker.

### 2. Routing Graph Shards (`_routing.tar` or Valhalla Tiles)
- **What it is**: A hierarchical tar archive containing pre-processed routing tiles built specifically for Valhalla's graph engine.
- **Why we need it**: Powers offline turn-by-turn routing, dynamic recalculations, and route planning on air-gapped devices.
- **Tooling**: Valhalla's internal build tools (`valhalla_build_tiles`) running locally or inside a container.

### 3. Gazetteer Search Index (`geocoder.db`)
- **What it is**: A lightweight SQLite full-text search database indexing cities, towns, streets, and key roadside POIs (such as fuel stations).
- **Why we need it**: Enables instant offline address, city, and POI geocoding without network access to external services (like Google Places or Nominatim).
- **Tooling**: Custom parser script (e.g., `osm2sqlite.py` or similar) using `osmfilter` to extract address and amenity tags from the PBF.

## Version Notes 

### Version 1: Faber (*The Smith*) — Completed
- **Pipeline Automation ([faber.sh](file:///home/mark/Documents/Iter%20Viae%20Core/tools/faber/faber.sh))**:
  - Implemented the core Bash pipeline to automate preprocessing of raw OpenStreetMap `.pbf` map extracts into production offline map datasets.
  - Enforced directory integrity checks (`tools/faber/`, `data/maps/raw/`, `data/maps/compiled/`) and pre-build output purging to maintain a single active map set.
  - Added strict input validation: checks `data/maps/raw/` and enforces strictly **one** `.pbf` file with user notifications on error.
- **Visual Master Tiles (`map.mbtiles`)**:
  - Integrated `tilemaker` configured with OpenMapTiles schema ([config.json](file:///home/mark/Documents/Iter%20Viae%20Core/tools/faber/config.json), [process.lua](file:///home/mark/Documents/Iter%20Viae%20Core/tools/faber/process.lua)) to compile vector tiles for MapLibre GL rendering.
- **Routing Graph Shards (`routing.tar`)**:
  - Integrated Valhalla routing graph builder to bundle pre-processed routing tiles into a `.tar` archive for offline navigation.
- **Gazetteer Search Index (`geocoder.db`)**:
  - Created [geocoder_builder.py](file:///home/mark/Documents/Iter%20Viae%20Core/tools/faber/geocoder_builder.py) leveraging `osmium` and SQLite FTS5 (`search_index`) to index places, streets, and roadside POIs for offline search.
