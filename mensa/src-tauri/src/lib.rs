use flate2::read::GzDecoder;
use rusqlite::{Connection, OpenFlags};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, State};

pub struct MbtilesState {
    app_handle: tauri::AppHandle,
    geocoder_conn: std::sync::Arc<std::sync::Mutex<Option<Connection>>>,
}

fn find_mbtiles_in_dir(dir: &std::path::Path) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }
    // 1. Check for standard map.mbtiles
    let standard = dir.join("map.mbtiles");
    if standard.exists() {
        return Some(standard);
    }
    // 2. Search for any .mbtiles file in the directory (excluding dem.mbtiles)
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path.extension().and_then(|s| s.to_str()) == Some("mbtiles")
                && path.file_name().and_then(|s| s.to_str()) != Some("dem.mbtiles")
            {
                return Some(path);
            }
        }
    }
    None
}

fn find_dem_mbtiles_in_dir(dir: &std::path::Path) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }
    let dem_path = dir.join("dem.mbtiles");
    if dem_path.exists() {
        return Some(dem_path);
    }
    None
}

impl MbtilesState {
    fn find_mbtiles_path(&self) -> Option<PathBuf> {
        // 1. Check primary OS app data directory (e.g. ~/.local/share/com.viae.mensa/maps or %APPDATA%/com.viae.mensa/maps)
        if let Ok(app_dir) = self.app_handle.path().app_data_dir() {
            let os_maps_dir = app_dir.join("maps");
            if let Some(path) = find_mbtiles_in_dir(&os_maps_dir) {
                return Some(path);
            }
        }

        // 2. Fallback to development workspace directory (data/maps/compiled)
        let mut curr = std::env::current_dir().unwrap_or_default();
        for _ in 0..4 {
            let candidate_dir = curr.join("data").join("maps").join("compiled");
            if let Some(path) = find_mbtiles_in_dir(&candidate_dir) {
                return Some(path);
            }
            if let Some(parent) = curr.parent() {
                curr = parent.to_path_buf();
            } else {
                break;
            }
        }

        None
    }

    fn find_dem_path(&self) -> Option<PathBuf> {
        if let Ok(app_dir) = self.app_handle.path().app_data_dir() {
            let os_maps_dir = app_dir.join("maps");
            if let Some(path) = find_dem_mbtiles_in_dir(&os_maps_dir) {
                return Some(path);
            }
        }

        let mut curr = std::env::current_dir().unwrap_or_default();
        for _ in 0..4 {
            let candidate_dir = curr.join("data").join("maps").join("compiled");
            if let Some(path) = find_dem_mbtiles_in_dir(&candidate_dir) {
                return Some(path);
            }
            if let Some(parent) = curr.parent() {
                curr = parent.to_path_buf();
            } else {
                break;
            }
        }

        None
    }
}

/// Resolves the installed OS application maps directory (~/.local/share/com.viae.mensa/maps on Linux, %APPDATA%/com.viae.mensa/maps on Windows)
fn get_os_app_maps_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        let os_maps_dir = app_dir.join("maps");
        let _ = std::fs::create_dir_all(&os_maps_dir);
        return os_maps_dir;
    }

    let fallback = std::env::current_dir()
        .unwrap_or_default()
        .join("data")
        .join("maps")
        .join("compiled");
    let _ = std::fs::create_dir_all(&fallback);
    fallback
}

#[tauri::command]
fn get_trips_dir(app_handle: tauri::AppHandle) -> String {
    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        let trips_dir = app_dir.join("trips");
        let _ = std::fs::create_dir_all(&trips_dir);
        return trips_dir.to_string_lossy().to_string();
    }
    
    // Fallback if app_data_dir fails
    let fallback = std::env::current_dir()
        .unwrap_or_default()
        .join("data")
        .join("trips");
    let _ = std::fs::create_dir_all(&fallback);
    fallback.to_string_lossy().to_string()
}

#[tauri::command]
fn save_trip_file(path: String, data: String) -> Result<(), String> {
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_trip_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

fn decompress_tile(data: Vec<u8>) -> Vec<u8> {
    // Check for gzip magic bytes 0x1f, 0x8b
    if data.len() >= 2 && data[0] == 0x1f && data[1] == 0x8b {
        let mut decoder = GzDecoder::new(&data[..]);
        let mut decompressed = Vec::new();
        if decoder.read_to_end(&mut decompressed).is_ok() {
            return decompressed;
        }
    }
    data
}

// ── POI geocoder lookup ──────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct PoiInfo {
    pub name: Option<String>,
    pub category: Option<String>,
    pub poi_type: Option<String>,
    pub address: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub details: Option<String>, // raw JSON blob from the details column
}

fn find_geocoder_path(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    // 1. OS app-data dir  (~/.local/share/com.viae.mensa/maps/geocoder.db)
    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        let p = app_dir.join("maps").join("geocoder.db");
        if p.exists() {
            return Some(p);
        }
    }
    // 2. Dev workspace fallback
    let mut curr = std::env::current_dir().unwrap_or_default();
    for _ in 0..4 {
        let p = curr
            .join("data")
            .join("maps")
            .join("compiled")
            .join("geocoder.db");
        if p.exists() {
            return Some(p);
        }
        if let Some(parent) = curr.parent() {
            curr = parent.to_path_buf();
        } else {
            break;
        }
    }
    None
}

#[tauri::command]
async fn get_poi_info(
    lat: f64,
    lon: f64,
    state: State<'_, MbtilesState>,
) -> Result<Option<PoiInfo>, String> {
    let app_handle = state.app_handle.clone();
    let conn_arc = state.geocoder_conn.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = conn_arc.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            if let Some(db_path) = find_geocoder_path(&app_handle) {
                if let Ok(conn) = Connection::open_with_flags(
                    &db_path,
                    OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
                ).or_else(|_| {
                    Connection::open_with_flags(
                        &db_path,
                        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
                    )
                }) {
                    let _ = conn.execute("PRAGMA mmap_size = 268435456;", []);
                    let _ = conn.execute("CREATE INDEX IF NOT EXISTS temp.idx_places_lat_lon ON places(lat, lon);", []);
                    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_places_lat_lon ON places(lat, lon);", []);
                    *guard = Some(conn);
                }
            }
        }

        let conn = match guard.as_ref() {
            Some(c) => c,
            None => return Ok(None),
        };

        // Search within ~0.003 deg (~300 m) bounding box, pick the closest row
        let tol = 0.003_f64;
        let mut stmt = conn
            .prepare(
                "SELECT name, category, type, address, lat, lon, details
             FROM places
             WHERE lat BETWEEN ?1 AND ?2 AND lon BETWEEN ?3 AND ?4
             ORDER BY ((lat - ?5) * (lat - ?5) + (lon - ?6) * (lon - ?6)) ASC
             LIMIT 1",
            )
            .map_err(|e| e.to_string())?;

        let result = stmt.query_row(
            rusqlite::params![lat - tol, lat + tol, lon - tol, lon + tol, lat, lon],
            |row| {
                Ok(PoiInfo {
                    name: row.get(0)?,
                    category: row.get(1)?,
                    poi_type: row.get(2)?,
                    address: row.get(3)?,
                    lat: row.get(4)?,
                    lon: row.get(5)?,
                    details: row.get(6)?,
                })
            },
        );

        match result {
            Ok(info) => Ok(Some(info)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn query_pois_near_point(
    lat: f64,
    lon: f64,
    radius_miles: f64,
    category: Option<String>,
    state: State<'_, MbtilesState>,
) -> Result<Vec<PoiInfo>, String> {
    let app_handle = state.app_handle.clone();
    let conn_arc = state.geocoder_conn.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = conn_arc.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            if let Some(db_path) = find_geocoder_path(&app_handle) {
                if let Ok(conn) = Connection::open_with_flags(
                    &db_path,
                    OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
                ).or_else(|_| {
                    Connection::open_with_flags(
                        &db_path,
                        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
                    )
                }) {
                    let _ = conn.execute("PRAGMA mmap_size = 268435456;", []);
                    let _ = conn.execute("CREATE INDEX IF NOT EXISTS temp.idx_places_lat_lon ON places(lat, lon);", []);
                    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_places_lat_lon ON places(lat, lon);", []);
                    *guard = Some(conn);
                }
            }
        }

        let conn = match guard.as_ref() {
            Some(c) => c,
            None => return Ok(Vec::new()),
        };

        let lat_delta = radius_miles / 69.0;
        let lon_delta = radius_miles / (69.0 * lat.to_radians().cos().max(0.1));

        let min_lat = lat - lat_delta;
        let max_lat = lat + lat_delta;
        let min_lon = lon - lon_delta;
        let max_lon = lon + lon_delta;

        let cat_filter = category.unwrap_or_else(|| "fuel".to_string());
        let search_term = cat_filter.trim_start_matches("poi_");
        let like_pattern = format!("%{}%", search_term);

        let mut stmt = conn
            .prepare(
                "SELECT name, category, type, address, lat, lon, details
                 FROM places
                 WHERE lat BETWEEN ?1 AND ?2 AND lon BETWEEN ?3 AND ?4
                   AND (category = ?5 OR category LIKE ?6 OR type LIKE ?6)
                 ORDER BY ((lat - ?7) * (lat - ?7) + (lon - ?8) * (lon - ?8)) ASC
                 LIMIT 10",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(
                rusqlite::params![min_lat, max_lat, min_lon, max_lon, cat_filter, like_pattern, lat, lon],
                |row| {
                    Ok(PoiInfo {
                        name: row.get(0)?,
                        category: row.get(1)?,
                        poi_type: row.get(2)?,
                        address: row.get(3)?,
                        lat: row.get(4)?,
                        lon: row.get(5)?,
                        details: row.get(6)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        for r in rows {
            if let Ok(poi) = r {
                results.push(poi);
            }
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_tile(z: u32, x: u32, y: u32, state: State<'_, MbtilesState>) -> Result<Vec<u8>, String> {
    let db_path = match state.find_mbtiles_path() {
        Some(path) => path,
        None => return Ok(Vec::new()),
    };

    let conn = Connection::open_with_flags(
        &db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| e.to_string())?;

    let tms_y = (1 << z) - 1 - y;
    let mut stmt = conn.prepare_cached(
        "SELECT tile_data FROM tiles WHERE zoom_level = ?1 AND tile_column = ?2 AND tile_row = ?3"
    ).map_err(|e| e.to_string())?;

    match stmt.query_row([z, x, tms_y], |row| row.get::<_, Vec<u8>>(0)) {
        Ok(data) => Ok(decompress_tile(data)),
        Err(_) => Ok(Vec::new()),
    }
}

#[tauri::command]
fn get_dem_tile(z: u32, x: u32, y: u32, state: State<'_, MbtilesState>) -> Result<Vec<u8>, String> {
    let dem_path = match state.find_dem_path() {
        Some(path) => path,
        None => return Ok(Vec::new()),
    };

    let conn = Connection::open_with_flags(
        &dem_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| e.to_string())?;

    // Fallback to max available DEM zoom level (z=8) when map is zoomed in to zoom 9..16+
    let target_z = if z > 8 { 8 } else { z };
    let shift = z.saturating_sub(target_z);
    let target_x = x >> shift;
    let target_y = y >> shift;

    let tms_y = (1 << target_z) - 1 - target_y;
    let mut stmt = conn.prepare_cached(
        "SELECT tile_data FROM tiles WHERE zoom_level = ?1 AND tile_column = ?2 AND tile_row = ?3"
    ).map_err(|e| e.to_string())?;

    match stmt.query_row([target_z, target_x, tms_y], |row| row.get::<_, Vec<u8>>(0)) {
        Ok(data) => Ok(data),
        Err(_) => Ok(Vec::new()),
    }
}

// ── Routing via Valhalla Sidecar ───────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize)]
pub struct Waypoint {
    pub lat: f64,
    pub lon: f64,
    #[serde(rename = "type")]
    pub wp_type: Option<String>,
}

#[derive(serde::Serialize)]
pub struct RouteResult {
    pub geojson: serde_json::Value,
    pub distance: f64,
    pub time: f64,
}

static HTTP_CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();

#[tauri::command]
async fn calculate_route(waypoints: Vec<Waypoint>, api_key: Option<String>) -> Result<RouteResult, String> {
    if waypoints.len() < 2 {
        return Err("Need at least 2 waypoints".into());
    }

    let mut locations = Vec::new();
    for wp in waypoints {
        let loc_type = wp.wp_type.unwrap_or_else(|| "break".to_string());
        locations.push(serde_json::json!({
            "lat": wp.lat,
            "lon": wp.lon,
            "type": loc_type
        }));
    }

    let request_body = serde_json::json!({
        "locations": locations,
        "costing": "auto",
        "units": "miles"
    });

    let client = HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    });

    let mut request_builder = client
        .post("https://valhalla.wade-usa.com/route")
        .json(&request_body);

    if let Some(ref key) = api_key {
        if !key.trim().is_empty() {
            request_builder = request_builder.header("X-API-Key", key.trim());
        }
    }

    let res = request_builder
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let valhalla_response: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    // Extract geojson line
    let trip = valhalla_response.get("trip").ok_or("No trip in response")?;
    let summary = trip.get("summary").ok_or("No summary in response")?;

    let distance = summary
        .get("length")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let time = summary.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0);

    // Convert Valhalla shape to GeoJSON (Valhalla uses polyline6 by default)
    // For simplicity, we just return the raw shape string, and let the frontend decode it using polyline library or we can decode it here.
    // It's easier if we ask Valhalla for polyline and decode it in JS, or if we can't easily, we just return the shape.
    // Wait, MapLibre doesn't natively decode polyline6.
    // Let's ask Valhalla for GeoJSON format by passing "format": "osrm" which MapLibre might not directly ingest,
    // but actually, we can just return the raw polyline shape string and handle decoding in `main.ts` or we can return the trip.

    Ok(RouteResult {
        geojson: valhalla_response,
        distance,
        time,
    })
}

#[derive(serde::Serialize)]
struct SavedTripItem {
    name: String,
    path: String,
}

#[tauri::command]
fn list_saved_trips(app_handle: tauri::AppHandle) -> Result<Vec<SavedTripItem>, String> {
    let trips_dir = std::path::PathBuf::from(get_trips_dir(app_handle));
    let mut items = Vec::new();

    if trips_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(trips_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                    if ext == "json" || ext == "viae" {
                        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("Trip").to_string();
                        items.push(SavedTripItem {
                            name,
                            path: path.to_string_lossy().to_string(),
                        });
                    }
                }
            }
        }
    }

    Ok(items)
}

#[derive(Clone, serde::Serialize)]
struct SyncProgressPayload {
    file_name: String,
    copied_bytes: u64,
    total_bytes: u64,
    percentage: u32,
    status_text: String,
}

/// Dereferences symlinks and copies raw file content with live progress event emission
fn copy_dereferenced_with_progress(
    app_handle: &tauri::AppHandle,
    src: &std::path::Path,
    dst: &std::path::Path,
    file_label: &str,
) -> Result<u64, String> {
    let real_src = match std::fs::canonicalize(src) {
        Ok(path) => path,
        Err(_) => src.to_path_buf(),
    };

    let metadata = std::fs::metadata(&real_src).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err("File is empty or not a regular file".to_string());
    }

    let total_bytes = metadata.len();
    let mut reader = std::fs::File::open(&real_src).map_err(|e| e.to_string())?;
    let mut writer = std::fs::File::create(dst).map_err(|e| e.to_string())?;

    let mut buffer = [0u8; 1024 * 1024]; // 1MB chunks
    let mut copied_bytes = 0u64;

    loop {
        let n = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        writer.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        copied_bytes += n as u64;

        let percentage = (((copied_bytes as f64) / (total_bytes as f64)) * 100.0) as u32;
        let _ = app_handle.emit(
            "sync-progress",
            SyncProgressPayload {
                file_name: file_label.to_string(),
                copied_bytes,
                total_bytes,
                percentage,
                status_text: format!(
                    "Copying {} ({:.1} MB / {:.1} MB)...",
                    file_label,
                    (copied_bytes as f64) / 1_048_576.0,
                    (total_bytes as f64) / 1_048_576.0
                ),
            },
        );
    }

    Ok(copied_bytes)
}

#[tauri::command]
async fn sync_maps_and_apk(app_handle: tauri::AppHandle, dest_dir: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let base_path = std::path::Path::new(&dest_dir).join("IterViae");
        let maps_dir = base_path.join("maps");
        let config_dir = base_path.join("config");

        std::fs::create_dir_all(&maps_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

        // Scan all candidate map directories for offline map artifacts
        let candidates = [
            get_os_app_maps_dir(&app_handle),
            std::path::PathBuf::from("/home/mark/Documents/Iter Viae Core/tools/faber/output"),
            std::path::PathBuf::from("/home/mark/Documents/Iter Viae Core/tools/faber/data"),
            std::path::PathBuf::from("/home/mark/Documents/Iter Viae Core/data/maps/compiled"),
            std::path::PathBuf::from("/home/mark/Documents/Iter Viae Core/data/maps"),
            std::path::PathBuf::from("/home/mark/Documents/Iter Viae Core/mensa/src-tauri/data/maps/compiled"),
            std::path::PathBuf::from("/home/mark/Documents/Iter Viae Core/mensa/src-tauri/data/maps"),
        ];

        let artifacts = ["map.mbtiles", "raster.mbtiles", "dem.mbtiles", "geocoder.db", "routing.tar"];
        let mut copied_count = 0;

        for artifact in artifacts {
            for dir in &candidates {
                let src = dir.join(artifact);
                if src.exists() {
                    let dst = maps_dir.join(artifact);
                    if copy_dereferenced_with_progress(&app_handle, &src, &dst, artifact).is_ok() {
                        copied_count += 1;
                        break;
                    }
                }
            }
        }

        // Copy default voice_prompts.json template if present
        let voice_src = std::path::Path::new("/home/mark/Documents/Iter Viae Core/navis/public/voice_prompts.json");
        if voice_src.exists() {
            let _ = copy_dereferenced_with_progress(&app_handle, voice_src, &config_dir.join("voice_prompts.json"), "voice_prompts.json");
        }

        // Scan candidate locations for Navis APK installation binary
        let apk_candidates = [
            std::path::PathBuf::from("/home/mark/Documents/Iter Viae Core/navis/Navis_v1.0.apk"),
            std::path::PathBuf::from("/home/mark/Documents/Iter Viae Core/navis/dist/Navis_v1.0.apk"),
            std::path::PathBuf::from("/home/mark/Documents/Iter Viae Core/navis/src-tauri/target/release/bundle/apk/app-release.apk"),
            std::path::PathBuf::from("/home/mark/Documents/Iter Viae Core/navis/src-tauri/gen/android/app/build/outputs/apk/debug/app-debug.apk"),
            std::path::PathBuf::from("/home/mark/Documents/Iter Viae Core/navis/src-tauri/gen/android/app/build/outputs/apk/release/app-release.apk"),
        ];

        let mut copied_apk = false;
        for apk_path in &apk_candidates {
            if apk_path.exists() {
                let dst = base_path.join("Navis_v1.0.apk");
                if copy_dereferenced_with_progress(&app_handle, apk_path, &dst, "Navis_v1.0.apk").is_ok() {
                    copied_apk = true;
                    break;
                }
            }
        }

        let apk_status = if copied_apk { "Navis.apk installer, " } else { "" };
        Ok(format!("Pushed {}{} map artifacts, and voice config to {}", apk_status, copied_count, base_path.display()))
    })
    .await
    .map_err(|e| e.to_string())?
}
fn open_maps_folder(app_handle: &tauri::AppHandle) {
    let path = get_os_app_maps_dir(app_handle);
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&path).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&path).spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&path).spawn();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {



            app.manage(MbtilesState {
                app_handle: app.handle().clone(),
                geocoder_conn: std::sync::Arc::new(std::sync::Mutex::new(None)),
            });

            // DevTools only available in dev builds
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.open_devtools();
            }

            let file_new_item = MenuItemBuilder::with_id("file-new", "New Trip")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;
            let file_load_item = MenuItemBuilder::with_id("file-load", "Load Trip...")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let file_save_item = MenuItemBuilder::with_id("file-save", "Save Trip")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let file_save_as_item = MenuItemBuilder::with_id("file-save-as", "Save As...")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;
            let file_print_item = MenuItemBuilder::with_id("file-print", "Print Itinerary...")
                .accelerator("CmdOrCtrl+P")
                .build(app)?;
                
            let quit_item = MenuItemBuilder::with_id("quit", "Quit Mensa")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&file_new_item)
                .item(&file_load_item)
                .item(&file_save_item)
                .item(&file_save_as_item)
                .separator()
                .item(&file_print_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let local_maps_item = MenuItemBuilder::with_id("open_maps_folder", "Local Maps")
                .accelerator("CmdOrCtrl+M")
                .build(app)?;

            let theme_options = [
                ("theme-2d-basic", "2D Basic Tactical (Default)"),
                ("theme-3d-buildings", "3D Buildings"),
            ];

            let mut theme_menu_builder = SubmenuBuilder::new(app, "Theme");
            for (id, label) in theme_options {
                let item = MenuItemBuilder::with_id(id, label).build(app)?;
                theme_menu_builder = theme_menu_builder.item(&item);
            }
            let theme_submenu = theme_menu_builder.build()?;

            let maps_menu = SubmenuBuilder::new(app, "Maps")
                .item(&local_maps_item)
                .item(&theme_submenu)
                .build()?;

            let gas_planner_item = MenuItemBuilder::with_id("tools-gas-planner", "Fuel Stop Planner...")
                .accelerator("CmdOrCtrl+F")
                .build(app)?;

            let tools_menu = SubmenuBuilder::new(app, "Tools")
                .item(&gas_planner_item)
                .build()?;

            let server_settings_item = MenuItemBuilder::with_id("settings-server", "Server & API Key Settings...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let settings_menu = SubmenuBuilder::new(app, "Settings")
                .item(&server_settings_item)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&maps_menu)
                .item(&tools_menu)
                .item(&settings_menu)
                .build()?;

            app.set_menu(menu)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_tile,
            get_dem_tile,
            get_poi_info,
            query_pois_near_point,
            calculate_route,
            get_trips_dir,
            save_trip_file,
            load_trip_file,
            sync_maps_and_apk,
            list_saved_trips
        ])
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id == "quit" {
                app.exit(0);
            } else if id == "file-new" {
                let _ = app.emit("menu-file-new", ());
            } else if id == "file-load" {
                let _ = app.emit("menu-file-load", ());
            } else if id == "file-save" {
                let _ = app.emit("menu-file-save", ());
            } else if id == "file-save-as" {
                let _ = app.emit("menu-file-save-as", ());
            } else if id == "file-print" {
                let _ = app.emit("menu-file-print", ());
            } else if id == "settings-server" {
                let _ = app.emit("menu-settings-server", ());
            } else if id == "tools-gas-planner" {
                let _ = app.emit("menu-tools-gas-planner", ());
            } else if id == "open_maps_folder" {
                open_maps_folder(app);
            } else if id.starts_with("theme-") {
                let theme_name = id.trim_start_matches("theme-");
                let _ = app.emit("menu-change-theme", theme_name);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
