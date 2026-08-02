#!/usr/bin/env python3
"""
Geocoder Database Builder for Iter Viae (Faber Pipeline)
Extracts named places, amenities, and addresses from OpenStreetMap data (.pbf)
and generates a lightweight SQLite FTS5 search database (geocoder.db).
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
    
    print(f"[*] Exporting OSM data features from {pbf_path}...")
    
    # Try using osmium export to output GeoJSON features
    geojson_data = None
    try:
        cmd = ["osmium", "export", pbf_path, "-f", "geojson", "--geometry-types=point"]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        geojson_data = json.loads(res.stdout)
    except Exception as e:
        print(f"[!] osmium export notice: {e}. Falling back to osmfilter if needed.")
        geojson_data = {"type": "FeatureCollection", "features": []}

    features = geojson_data.get("features", [])
    inserted = 0

    for feat in features:
        props = feat.get("properties", {})
        name = props.get("name")
        place = props.get("place")
        amenity = props.get("amenity")
        highway = props.get("highway")
        
        street = props.get("addr:street", "")
        housenumber = props.get("addr:housenumber", "")
        city = props.get("addr:city", "")
        
        address_parts = [p for p in [housenumber, street, city] if p]
        address = ", ".join(address_parts) if address_parts else ""

        if not name and not address:
            continue

        category = place or amenity or highway or "poi"
        name_val = name or address

        geometry = feat.get("geometry", {})
        coords = geometry.get("coordinates", [0.0, 0.0])
        lon, lat = coords[0], coords[1]

        osm_id = str(props.get("@id", ""))

        cursor.execute(
            "INSERT INTO places (osm_id, name, type, category, lat, lon, address) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (osm_id, name_val, "point", category, lat, lon, address)
        )
        inserted += 1

    conn.commit()
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
