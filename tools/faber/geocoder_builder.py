#!/usr/bin/env python3
"""
Geocoder Database Builder for Iter Viae (Faber Pipeline)
Extracts named places, amenities, and addresses from OpenStreetMap data (.pbf)
via stream-processing and generates a lightweight SQLite FTS5 search database (geocoder.db).
"""

import sys
import os
import json
import sqlite3
import subprocess

def create_geocoder_db(db_path):
    if os.path.exists(db_path):
        os.remove(db_path)
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("PRAGMA synchronous = OFF;")
    cursor.execute("PRAGMA journal_mode = MEMORY;")
    
    cursor.execute("""
    CREATE TABLE places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        osm_id TEXT,
        name TEXT NOT NULL,
        type TEXT,
        category TEXT,
        lat REAL,
        lon REAL,
        address TEXT
    );
    """)
    
    cursor.execute("""
    CREATE VIRTUAL TABLE search_index USING fts5(
        name,
        category,
        address,
        content='places',
        content_rowid='id'
    );
    """)
    
    cursor.execute("""
    CREATE TRIGGER places_ai AFTER INSERT ON places BEGIN
        INSERT INTO search_index(rowid, name, category, address) 
        VALUES (new.id, new.name, new.category, new.address);
    END;
    """)
    
    conn.commit()
    return conn

def extract_and_populate(pbf_path, db_path):
    conn = create_geocoder_db(db_path)
    cursor = conn.cursor()
    
    print(f"[*] Stream-extracting OSM features from {pbf_path} using osmium...")
    
    temp_filtered_pbf = db_path + ".filtered.pbf"
    
    filter_cmd = [
        "osmium", "tags-filter", pbf_path,
        "n/place", "w/place",
        "n/amenity", "w/amenity",
        "n/addr:housenumber", "w/addr:housenumber",
        "n/addr:street", "w/addr:street",
        "n/shop", "w/shop",
        "-o", temp_filtered_pbf, "-O"
    ]
    
    try:
        subprocess.run(filter_cmd, check=True)
    except Exception as e:
        print(f"[!] Failed to filter PBF with osmium: {e}")
        conn.close()
        if os.path.exists(temp_filtered_pbf):
            os.remove(temp_filtered_pbf)
        sys.exit(1)

    export_cmd = [
        "osmium", "export", temp_filtered_pbf,
        "-f", "geojsonseq",
        "--geometry-types=point"
    ]
    
    try:
        p2 = subprocess.Popen(export_cmd, stdout=subprocess.PIPE, text=True, bufsize=1024*1024)
    except Exception as e:
        print(f"[!] Failed to export features from filtered PBF: {e}")
        conn.close()
        if os.path.exists(temp_filtered_pbf):
            os.remove(temp_filtered_pbf)
        sys.exit(1)

    inserted = 0
    batch = []
    BATCH_SIZE = 10000

    sql = "INSERT INTO places (osm_id, name, type, category, lat, lon, address) VALUES (?, ?, ?, ?, ?, ?, ?)"

    if p2.stdout:
        for line in p2.stdout:
            line = line.strip()
            if not line or line.startswith('\x1e'):
                line = line.lstrip('\x1e')
                if not line:
                    continue
            try:
                feat = json.loads(line)
            except Exception:
                continue

            props = feat.get("properties", {})
            name = props.get("name")
            place = props.get("place")
            amenity = props.get("amenity")
            highway = props.get("highway")
            shop = props.get("shop")
            
            street = props.get("addr:street", "")
            housenumber = props.get("addr:housenumber", "")
            city = props.get("addr:city", "")
            
            address_parts = [p for p in [housenumber, street, city] if p]
            address = ", ".join(address_parts) if address_parts else ""

            if not name and not address:
                continue

            category = place or amenity or shop or highway or "poi"
            name_val = name or address

            geometry = feat.get("geometry", {})
            coords = geometry.get("coordinates", [0.0, 0.0])
            if not coords or len(coords) < 2:
                continue
            lon, lat = coords[0], coords[1]

            osm_id = str(props.get("@id", ""))

            batch.append((osm_id, name_val, "point", category, lat, lon, address))
            inserted += 1

            if len(batch) >= BATCH_SIZE:
                cursor.executemany(sql, batch)
                conn.commit()
                batch.clear()
                if inserted % 50000 == 0:
                    print(f"  ... Indexed {inserted} locations so far...")

    if batch:
        cursor.executemany(sql, batch)
        conn.commit()
        batch.clear()

    p2.wait()

    if os.path.exists(temp_filtered_pbf):
        try:
            os.remove(temp_filtered_pbf)
        except Exception:
            pass

    cursor.execute("PRAGMA synchronous = NORMAL;")
    cursor.execute("PRAGMA journal_mode = WAL;")
    conn.close()
    
    print(f"[+] Successfully populated geocoder.db with {inserted} searchable locations.")

def main():
    if len(sys.argv) < 3:
        print("Usage: geocoder_builder.py <input.pbf> <output_geocoder.db>")
        sys.exit(1)
        
    pbf_input = sys.argv[1]
    db_output = sys.argv[2]
    
    if not os.path.exists(pbf_input):
        print(f"[!] Error: Input file '{pbf_input}' does not exist.")
        sys.exit(1)

    extract_and_populate(pbf_input, db_output)

if __name__ == "__main__":
    main()
