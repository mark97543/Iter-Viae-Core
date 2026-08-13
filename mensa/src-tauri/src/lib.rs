use flate2::read::GzDecoder;
use rusqlite::{Connection, OpenFlags};
use std::io::Read;
use std::path::PathBuf;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

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

#[tauri::command]
async fn calculate_route(waypoints: Vec<Waypoint>) -> Result<RouteResult, String> {
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
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Spawn the Valhalla Sidecar in the background
            let maps_dir = get_os_app_maps_dir(app.handle());
            let maps_dir_str = maps_dir.to_string_lossy().to_string();

            let valhalla_sidecar = app.shell().sidecar("valhalla_service");
            if let Ok(mut command) = valhalla_sidecar {
                command = command.args([&maps_dir_str]);
                tauri::async_runtime::spawn(async move {
                    if let Ok((mut rx, _child)) = command.spawn() {
                        while let Some(event) = rx.recv().await {
                            if let CommandEvent::Stdout(line) = event {
                                println!("Valhalla Sidecar: {}", String::from_utf8_lossy(&line));
                            }
                        }
                    }
                });
            }

            app.manage(MbtilesState {
                app_handle: app.handle().clone(),
                geocoder_conn: std::sync::Arc::new(std::sync::Mutex::new(None)),
            });

            // File Menu
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

            // Local Maps Item
            let local_maps_item = MenuItemBuilder::with_id("open_maps_folder", "Local Maps")
                .accelerator("CmdOrCtrl+M")
                .build(app)?;

            // 3 Core Map Modes: 2D Basic, 3D Buildings, 3D Mountain Terrain
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

            // Tools Menu
            let gas_planner_item = MenuItemBuilder::with_id("tools-gas-planner", "Fuel Stop Planner...")
                .accelerator("CmdOrCtrl+F")
                .build(app)?;

            let tools_menu = SubmenuBuilder::new(app, "Tools")
                .item(&gas_planner_item)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&maps_menu)
                .item(&tools_menu)
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
            load_trip_file
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
