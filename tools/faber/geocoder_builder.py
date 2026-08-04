#!/usr/bin/env python3
"""
Geocoder Database Builder for Iter Viae (Faber Pipeline)
Extracts named places, amenities, and addresses from OpenStreetMap data (.pbf)
via stream-processing and generates a lightweight SQLite FTS5 search database (geocoder.db).
Optimized for low RAM usage and disk-backed caching.
"""

import sys
import os
import json
import sqlite3
import subprocess
import gc

def create_geocoder_db(db_path):
    if os.path.exists(db_path):
        os.remove(db_path)
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # SQLite performance & RAM optimization for bulk creation
    cursor.execute("PRAGMA synchronous = OFF;")
    cursor.execute("PRAGMA journal_mode = OFF;")
    cursor.execute("PRAGMA cache_size = -64000;")  # 64 MB cache limit
    cursor.execute("PRAGMA temp_store = FILE;")
    cursor.execute("PRAGMA page_size = 4096;")
    
    cursor.execute("""
    CREATE TABLE places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        osm_id TEXT,
        name TEXT NOT NULL,
        type TEXT,
        category TEXT,
        lat REAL,
        lon REAL,
        address TEXT,
        details TEXT
    );
    """)
    
    conn.commit()
    return conn

def finalize_geocoder_db(conn):
    """
    Build FTS5 index in bulk after all records are inserted into `places`,
    and attach trigger for future incremental inserts.
    """
    cursor = conn.cursor()
    print("[*] Building FTS5 full-text search index (bulk indexing)...")
    
    cursor.execute("""
    CREATE VIRTUAL TABLE search_index USING fts5(
        name,
        category,
        address,
        details,
        content='places',
        content_rowid='id'
    );
    """)
    
    cursor.execute("""
    INSERT INTO search_index(rowid, name, category, address, details)
    SELECT id, name, category, address, details FROM places;
    """)
    
    cursor.execute("INSERT INTO search_index(search_index) VALUES('optimize');")
    
    cursor.execute("""
    CREATE TRIGGER places_ai AFTER INSERT ON places BEGIN
        INSERT INTO search_index(rowid, name, category, address, details) 
        VALUES (new.id, new.name, new.category, new.address, new.details);
    END;
    """)
    
    conn.commit()
    
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")
    conn.close()
    print("[+] FTS5 search index creation completed.")

def extract_and_populate(pbf_path, db_path):
    conn = create_geocoder_db(db_path)
    cursor = conn.cursor()
    
    # Configure workspace-local temp directory for Osmium file-backed node caches
    compiled_dir = os.path.dirname(os.path.abspath(db_path))
    tmp_dir = os.path.join(compiled_dir, ".tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    
    env = os.environ.copy()
    env["TMPDIR"] = tmp_dir
    env["OSMIUM_CACHE_DIR"] = tmp_dir

    print(f"[*] Stream-extracting OSM features from {pbf_path} using osmium (disk-backed cache)...")
    
    temp_filtered_pbf = db_path + ".filtered.pbf"
    
    # Filter only elements with place, amenity, shop, address, or name tags.
    # Exclude unnamed highway geometries to save memory & CPU.
    filter_cmd = [
        "osmium", "tags-filter", pbf_path,
        "n/place", "w/place",
        "n/amenity", "w/amenity",
        "n/shop", "w/shop",
        "n/addr:housenumber", "w/addr:housenumber",
        "n/addr:street", "w/addr:street",
        "n/name", "w/name",
        "-o", temp_filtered_pbf, "-O"
    ]
    
    try:
        subprocess.run(filter_cmd, check=True, env=env)
    except Exception as e:
        print(f"[!] Failed to filter PBF with osmium: {e}")
        conn.close()
        if os.path.exists(temp_filtered_pbf):
            os.remove(temp_filtered_pbf)
        sys.exit(1)

    export_cmd = [
        "osmium", "export", temp_filtered_pbf,
        "-f", "geojsonseq",
        "--geometry-types=point",
        "-i", "sparse_file_array"
    ]
    
    try:
        p2 = subprocess.Popen(export_cmd, stdout=subprocess.PIPE, text=True, bufsize=1024*1024, env=env)
    except Exception as e:
        print(f"[!] Failed to export features from filtered PBF: {e}")
        conn.close()
        if os.path.exists(temp_filtered_pbf):
            os.remove(temp_filtered_pbf)
        sys.exit(1)

    inserted = 0
    batch = []
    BATCH_SIZE = 25000

    sql = "INSERT INTO places (osm_id, name, type, category, lat, lon, address, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"

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

            extracted_keys = {"@id", "name", "place", "amenity", "highway", "shop", "addr:street", "addr:housenumber", "addr:city"}
            details_dict = {k: v for k, v in props.items() if k not in extracted_keys}
            details_json = json.dumps(details_dict, ensure_ascii=False) if details_dict else ""

            batch.append((osm_id, name_val, "point", category, lat, lon, address, details_json))
            inserted += 1

            if len(batch) >= BATCH_SIZE:
                cursor.executemany(sql, batch)
                conn.commit()
                batch.clear()
                gc.collect()
                if inserted % 100000 == 0:
                    print(f"  ... Extracted and cached {inserted} locations...")

    if batch:
        cursor.executemany(sql, batch)
        conn.commit()
        batch.clear()
        gc.collect()

    p2.wait()

    if os.path.exists(temp_filtered_pbf):
        try:
            os.remove(temp_filtered_pbf)
        except Exception:
            pass

    finalize_geocoder_db(conn)
    
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
