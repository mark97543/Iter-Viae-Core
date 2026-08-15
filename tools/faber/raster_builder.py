#!/usr/bin/env python3
"""
Iter Viae Core — Faber (The Smith)
Mobile Real Map Raster Tile Builder (raster_builder.py)
Downloads and packages real high-resolution dark tactical raster tiles into raster.mbtiles.
"""

import sys
import os
import sqlite3
import urllib.request
import time
from concurrent.futures import ThreadPoolExecutor

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) IterViae/1.0"

def fetch_tile(z, x, y):
    url = f"https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.read()
    except Exception:
        # Fallback tile URL
        try:
            fallback_url = f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            req_fb = urllib.request.Request(fallback_url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req_fb, timeout=5) as response:
                return response.read()
        except Exception:
            return None

def build_raster_mbtiles(input_pbf, output_mbtiles):
    print(f"[FABER RASTER] Target output raster package: {output_mbtiles}")
    
    output_dir = os.path.dirname(output_mbtiles)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    if os.path.exists(output_mbtiles):
        os.remove(output_mbtiles)
        
    conn = sqlite3.connect(output_mbtiles)
    cursor = conn.cursor()
    
    cursor.execute("CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT);")
    cursor.execute("CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row);")
    
    metadata = [
        ("name", "Iter Viae Faber Mobile Raster Basemap"),
        ("type", "baselayer"),
        ("version", "1.0"),
        ("description", "Pre-baked real high-resolution mobile map tiles"),
        ("format", "png"),
        ("minzoom", "0"),
        ("maxzoom", "14"),
        ("bounds", "-180.0,-85.0,180.0,85.0"),
    ]
    
    cursor.executemany("INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?);", metadata)
    conn.commit()
    
    print("[FABER RASTER] Downloading & packaging real high-resolution dark tactical map tiles...")
    
    tasks = []
    # Collect tile list for zoom 0 to 7
    for z in range(0, 8):
        max_coord = 1 << z
        for x in range(max_coord):
            for y in range(max_coord):
                tasks.append((z, x, y))
                
    tiles_inserted = 0
    batch = []
    
    def process_task(task):
        z, x, y = task
        tile_bytes = fetch_tile(z, x, y)
        if tile_bytes:
            tile_row = (1 << z) - 1 - y
            return (z, x, tile_row, tile_bytes)
        return None

    with ThreadPoolExecutor(max_workers=16) as executor:
        results = executor.map(process_task, tasks)
        for res in results:
            if res:
                batch.append(res)
                tiles_inserted += 1
                if len(batch) >= 100:
                    cursor.executemany("INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?);", batch)
                    conn.commit()
                    batch = []
                    print(f"  Downloaded {tiles_inserted}/{len(tasks)} real map tiles...", end="\r", flush=True)

    if batch:
        cursor.executemany("INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?);", batch)
        conn.commit()

    conn.close()
    print(f"\n[FABER RASTER] Successfully packaged {tiles_inserted} real map tiles into: {output_mbtiles}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: raster_builder.py <input_pbf> <output_mbtiles>")
        sys.exit(1)
    build_raster_mbtiles(sys.argv[1], sys.argv[2])
