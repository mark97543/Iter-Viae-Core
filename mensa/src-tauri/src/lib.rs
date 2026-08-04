use std::path::PathBuf;
use rusqlite::{Connection, OpenFlags};
use tauri::{Manager, State};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

pub struct MbtilesState {
    db_path: PathBuf,
}

fn resolve_app_maps_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    // 1. Check native OS app data directory for installed applications (~/.local/share/com.viae.mensa/maps or %APPDATA%/com.viae.mensa/maps)
    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        let os_maps_dir = app_dir.join("maps");
        if os_maps_dir.join("map.mbtiles").exists() {
            return os_maps_dir;
        }
    }

    // 2. Check local workspace development folder (data/maps/compiled)
    let mut curr = std::env::current_dir().unwrap_or_default();
    for _ in 0..4 {
        let candidate = curr.join("data").join("maps").join("compiled");
        if candidate.join("map.mbtiles").exists() || candidate.exists() {
            return candidate;
        }
        if let Some(parent) = curr.parent() {
            curr = parent.to_path_buf();
        } else {
            break;
        }
    }

    // 3. Fallback: Create and return native OS application data maps folder
    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        let os_maps_dir = app_dir.join("maps");
        let _ = std::fs::create_dir_all(&os_maps_dir);
        return os_maps_dir;
    }

    let fallback = std::env::current_dir().unwrap_or_default().join("data").join("maps").join("compiled");
    let _ = std::fs::create_dir_all(&fallback);
    fallback
}

#[tauri::command]
fn get_tile(z: u32, x: u32, y: u32, state: State<'_, MbtilesState>) -> Result<Vec<u8>, String> {
    if !state.db_path.exists() {
        return Ok(Vec::new());
    }

    let conn = Connection::open_with_flags(
        &state.db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    ).map_err(|e| e.to_string())?;

    let tms_y = (1 << z) - 1 - y;
    let mut stmt = conn.prepare_cached(
        "SELECT tile_data FROM tiles WHERE zoom_level = ?1 AND tile_column = ?2 AND tile_row = ?3"
    ).map_err(|e| e.to_string())?;

    match stmt.query_row([z, x, tms_y], |row| row.get(0)) {
        Ok(data) => Ok(data),
        Err(_) => Ok(Vec::new()),
    }
}

fn open_maps_folder(app_handle: &tauri::AppHandle) {
    let path = resolve_app_maps_dir(app_handle);
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
            let db_path = resolve_app_maps_dir(app.handle()).join("map.mbtiles");
            app.manage(MbtilesState { db_path });

            // File Menu
            let quit_item = MenuItemBuilder::with_id("quit", "Quit Mensa")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&quit_item)
                .build()?;

            // Maps Menu (Single item: Local Maps)
            let local_maps_item = MenuItemBuilder::with_id("open_maps_folder", "Local Maps")
                .accelerator("CmdOrCtrl+M")
                .build(app)?;

            let maps_menu = SubmenuBuilder::new(app, "Maps")
                .item(&local_maps_item)
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
            match event.id().as_ref() {
                "quit" => {
                    app.exit(0);
                }
                "open_maps_folder" => {
                    open_maps_folder(app);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
