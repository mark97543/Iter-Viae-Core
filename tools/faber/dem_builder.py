#!/usr/bin/env python3
"""
ITER VIAE CORE — FABER (THE SMITH)
Step 7: 3D DEM Elevation Dataset Compiler (dem.mbtiles)

Downloads Terrarium DEM elevation tiles (encoding: "terrarium") and packages them
into a high-performance SQLite MBTiles database for true 3D WebGL terrain rendering in Mensa.
"""

import os
import sys
import sqlite3
import urllib.request
import concurrent.futures
from pathlib import Path

# Terrarium DEM URL template
TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

def init_mbtiles_db(db_path: Path):
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("CREATE TABLE metadata (name text, value text);")
    cursor.execute("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);")
    cursor.execute("CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row);")

    metadata = [
        ("name", "Terrarium 3D DEM Elevation"),
        ("type", "baselayer"),
        ("version", "1.0"),
        ("description", "AWS Terrarium Digital Elevation Model tiles for 3D terrain elevation mesh"),
        ("format", "png"),
        ("bounds", "-180.0,-85.0511,180.0,85.0511"),
        ("minzoom", "0"),
        ("maxzoom", "10"),
    ]
    cursor.executemany("INSERT INTO metadata VALUES (?, ?);", metadata)
    conn.commit()
    conn.close()

def download_tile(z: int, x: int, y: int) -> tuple[int, int, int, bytes | None]:
    url = TERRARIUM_URL.format(z=z, x=x, y=y)
    # Convert XYZ y to TMS row for MBTiles
    tms_y = (1 << z) - 1 - y
    req = urllib.request.Request(url, headers={"User-Agent": "IterViaeFaber/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            return (z, x, tms_y, data)
    except Exception:
        return (z, x, tms_y, None)

def build_dem_mbtiles(output_dir: Path, max_zoom: int = 5):
    output_dir.mkdir(parents=True, exist_ok=True)
    db_path = output_dir / "dem.mbtiles"
    print(f"[INFO] Initializing DEM MBTiles database: {db_path}")
    init_mbtiles_db(db_path)

    tiles_to_fetch = []
    for z in range(0, max_zoom + 1):
        num_tiles = 1 << z
        for x in range(num_tiles):
            for y in range(num_tiles):
                tiles_to_fetch.append((z, x, y))

    print(f"[INFO] Compiling {len(tiles_to_fetch)} DEM elevation tiles (zoom 0 to {max_zoom})...")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    count = 0
    saved = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        futures = [executor.submit(download_tile, z, x, y) for z, x, y in tiles_to_fetch]
        for future in concurrent.futures.as_completed(futures):
            z, x, tms_y, tile_data = future.result()
            count += 1
            if tile_data:
                cursor.execute("INSERT OR REPLACE INTO tiles VALUES (?, ?, ?, ?)", (z, x, tms_y, tile_data))
                saved += 1
            if count % 50 == 0 or count == len(tiles_to_fetch):
                print(f"       Progress: {count}/{len(tiles_to_fetch)} tiles processed ({saved} saved)...", end="\r")
                conn.commit()

    conn.commit()
    conn.close()
    print(f"\n[SUCCESS] DEM elevation dataset compiled: {db_path} ({saved} tiles saved).")

def main():
    if len(sys.argv) > 1:
        out_dir = Path(sys.argv[1])
    else:
        out_dir = Path("/home/mark/Documents/Iter Viae Core/data/maps/compiled")
    
    zoom_limit = 5
    if len(sys.argv) > 2:
        try:
            zoom_limit = int(sys.argv[2])
        except ValueError:
            pass

    build_dem_mbtiles(out_dir, max_zoom=zoom_limit)

if __name__ == "__main__":
    main()
