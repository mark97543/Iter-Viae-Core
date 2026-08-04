use std::io::Read;
use std::path::PathBuf;
use flate2::read::GzDecoder;
use rusqlite::{Connection, OpenFlags};
use tauri::{Emitter, Manager, State};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

pub struct MbtilesState {
    app_handle: tauri::AppHandle,
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
    // 2. Search for any .mbtiles file in the directory
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("mbtiles") {
                return Some(path);
            }
        }
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
}

/// Resolves the installed OS application maps directory (~/.local/share/com.viae.mensa/maps on Linux, %APPDATA%/com.viae.mensa/maps on Windows)
fn get_os_app_maps_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        let os_maps_dir = app_dir.join("maps");
        let _ = std::fs::create_dir_all(&os_maps_dir);
        return os_maps_dir;
    }

    let fallback = std::env::current_dir().unwrap_or_default().join("data").join("maps").join("compiled");
    let _ = std::fs::create_dir_all(&fallback);
    fallback
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

#[tauri::command]
fn get_tile(z: u32, x: u32, y: u32, state: State<'_, MbtilesState>) -> Result<Vec<u8>, String> {
    let db_path = match state.find_mbtiles_path() {
        Some(path) => path,
        None => return Ok(Vec::new()),
    };

    let conn = Connection::open_with_flags(
        &db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    ).map_err(|e| e.to_string())?;

    let tms_y = (1 << z) - 1 - y;
    let mut stmt = conn.prepare_cached(
        "SELECT tile_data FROM tiles WHERE zoom_level = ?1 AND tile_column = ?2 AND tile_row = ?3"
    ).map_err(|e| e.to_string())?;

    match stmt.query_row([z, x, tms_y], |row| row.get::<_, Vec<u8>>(0)) {
        Ok(data) => Ok(decompress_tile(data)),
        Err(_) => Ok(Vec::new()),
    }
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
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(MbtilesState {
                app_handle: app.handle().clone(),
            });

            // File Menu
            let quit_item = MenuItemBuilder::with_id("quit", "Quit Mensa")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
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
                ("theme-3d-terrain", "3D Mountain Terrain"),
            ];

            let mut theme_menu_builder = SubmenuBuilder::new(app, "Theme");
            for (id, label) in theme_options {
                let item = MenuItemBuilder::with_id(id, label).build(app)?;
                theme_menu_builder = theme_menu_builder.item(&item);
            }
            let theme_submenu = theme_menu_builder.build()?;

            // Maps Menu containing Local Maps & Theme Submenu
            let maps_menu = SubmenuBuilder::new(app, "Maps")
                .item(&local_maps_item)
                .item(&theme_submenu)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&maps_menu)
                .build()?;

            app.set_menu(menu)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_tile])
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id == "quit" {
                app.exit(0);
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
