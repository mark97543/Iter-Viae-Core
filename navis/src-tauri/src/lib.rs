use flate2::read::GzDecoder;
use rusqlite::{Connection, OpenFlags};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http::{header::*, Response, StatusCode};
use tauri::Manager;

pub struct MapDbState {
    pub conn: Mutex<Option<Connection>>,
    pub tile_cache: Mutex<HashMap<(u32, u32, u32), Vec<u8>>>,
}

impl Default for MapDbState {
    fn default() -> Self {
        Self {
            conn: Mutex::new(None),
            tile_cache: Mutex::new(HashMap::new()),
        }
    }
}

fn find_mbtiles_in_dir(dir: &Path) -> Option<PathBuf> {
    if !dir.exists() || !dir.is_dir() {
        return None;
    }
    let standard = dir.join("map.mbtiles");
    if standard.exists() && standard.is_file() {
        return Some(standard);
    }
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

fn find_mbtiles_path(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(storage_entries) = std::fs::read_dir("/storage") {
        for entry in storage_entries.flatten() {
            let volume_path = entry.path();
            if volume_path.is_dir() {
                let subdirs = [
                    volume_path.join("IterViae").join("maps"),
                    volume_path.join("IterViae"),
                    volume_path.join("maps"),
                    volume_path.clone(),
                ];
                for sub in subdirs {
                    if let Some(found) = find_mbtiles_in_dir(&sub) {
                        return Some(found);
                    }
                }
            }
        }
    }

    let hardcoded_candidates = [
        "/sdcard/IterViae/maps",
        "/sdcard/IterViae",
        "/sdcard",
        "/storage/emulated/0/IterViae/maps",
        "/storage/emulated/0/IterViae",
        "/storage/emulated/0",
        "/storage/self/primary/IterViae/maps",
        "/storage/self/primary/IterViae",
        "/storage/self/primary",
        "/media/sdcard/IterViae/maps",
        "/media/sdcard/IterViae",
        "/media/sdcard",
        "/mnt/sdcard/IterViae/maps",
        "/mnt/sdcard/IterViae",
        "/mnt/sdcard",
    ];

    for dir_str in hardcoded_candidates {
        let dir = Path::new(dir_str);
        if let Some(path) = find_mbtiles_in_dir(dir) {
            return Some(path);
        }
    }

    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        let os_maps_dir = app_dir.join("maps");
        if let Some(path) = find_mbtiles_in_dir(&os_maps_dir) {
            return Some(path);
        }
    }

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

fn decompress_tile(data: Vec<u8>) -> Vec<u8> {
    if data.len() >= 2 && data[0] == 0x1f && data[1] == 0x8b {
        let mut decoder = GzDecoder::new(&data[..]);
        let mut decompressed = Vec::new();
        if decoder.read_to_end(&mut decompressed).is_ok() {
            return decompressed;
        }
    }
    data
}

// Fetch tile with RAM caching and persistent SQLite connection pool
fn fetch_tile_cached(app_handle: &tauri::AppHandle, state: &MapDbState, z: u32, x: u32, y: u32) -> Vec<u8> {
    let key = (z, x, y);

    // 1. Check RAM Cache
    if let Ok(cache) = state.tile_cache.lock() {
        if let Some(cached) = cache.get(&key) {
            return cached.clone();
        }
    }

    let tms_y = (1 << z) - 1 - y;

    // 2. Query persistent SQLite Connection
    if let Ok(mut conn_guard) = state.conn.lock() {
        if conn_guard.is_none() {
            if let Some(db_path) = find_mbtiles_path(app_handle) {
                if let Ok(conn) = Connection::open_with_flags(
                    &db_path,
                    OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
                ) {
                    *conn_guard = Some(conn);
                }
            }
        }

        if let Some(conn) = conn_guard.as_ref() {
            if let Ok(mut stmt) = conn.prepare_cached(
                "SELECT tile_data FROM tiles WHERE zoom_level = ?1 AND tile_column = ?2 AND (tile_row = ?3 OR tile_row = ?4)",
            ) {
                if let Ok(data) = stmt.query_row([z, x, tms_y, y], |row| row.get::<_, Vec<u8>>(0)) {
                    let tile_bytes = decompress_tile(data);

                    // Save in RAM Cache (limit 1,000 tiles)
                    if let Ok(mut cache) = state.tile_cache.lock() {
                        if cache.len() > 1000 {
                            cache.clear();
                        }
                        cache.insert(key, tile_bytes.clone());
                    }

                    return tile_bytes;
                }
            }
        }
    }

    Vec::new()
}

fn handle_mbtiles_protocol(
    app_handle: &tauri::AppHandle,
    state: &MapDbState,
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let uri_path = request.uri().path();
    let clean_path = uri_path.trim_start_matches('/');
    let parts: Vec<&str> = clean_path.split('/').collect();

    if parts.len() >= 3 {
        if let (Ok(z), Ok(x), Ok(y)) = (
            parts[parts.len() - 3].parse::<u32>(),
            parts[parts.len() - 2].parse::<u32>(),
            parts[parts.len() - 1].parse::<u32>(),
        ) {
            let tile_data = fetch_tile_cached(app_handle, state, z, x, y);
            if !tile_data.is_empty() {
                let builder = Response::builder()
                    .status(StatusCode::OK)
                    .header(CONTENT_TYPE, "application/x-protobuf")
                    .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*");

                if let Ok(resp) = builder.body(tile_data) {
                    return resp;
                }
            }
        }
    }

    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Vec::new())
        .unwrap()
}

#[tauri::command]
fn get_tile(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, MapDbState>,
    z: u32,
    x: u32,
    y: u32,
) -> Result<Vec<u8>, String> {
    Ok(fetch_tile_cached(&app_handle, state.inner(), z, x, y))
}

// ── Routing via Local Valhalla Sidecar Engine ─────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize)]
pub struct WaypointInput {
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

#[tauri::command]
async fn calculate_route(waypoints: Vec<WaypointInput>) -> Result<RouteResult, String> {
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

    let client = reqwest::Client::new();
    let res = client
        .post("http://localhost:8002/route")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let valhalla_response: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    let trip = valhalla_response.get("trip").ok_or("No trip in response")?;
    let summary = trip.get("summary").ok_or("No summary in response")?;

    let distance = summary
        .get("length")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let time = summary.get("time").and_then(|v| v.as_f64()).unwrap_or(0.0);

    Ok(RouteResult {
        geojson: valhalla_response,
        distance,
        time,
    })
}

#[tauri::command]
fn scan_sdcard_maps(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let mut found_paths = Vec::new();
    if let Some(path) = find_mbtiles_path(&app_handle) {
        found_paths.push(path.to_string_lossy().to_string());
    }
    Ok(found_paths)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(MapDbState::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .register_uri_scheme_protocol("mbtiles", |ctx, request| {
            let state = ctx.app_handle().state::<MapDbState>();
            handle_mbtiles_protocol(ctx.app_handle(), state.inner(), &request)
        })
        .invoke_handler(tauri::generate_handler![
            scan_sdcard_maps,
            get_tile,
            calculate_route
        ])
        .run(tauri::generate_context!())
        .expect("error while running Navis mobile application");
}
