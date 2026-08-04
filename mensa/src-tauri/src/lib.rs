use std::path::PathBuf;
use rusqlite::{Connection, OpenFlags};
use tauri::State;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

pub struct MbtilesState {
    db_path: PathBuf,
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

fn open_maps_folder() {
    let mut path = std::env::current_dir().unwrap_or_default();
    path.push("data");
    path.push("maps");
    path.push("compiled");

    if !path.exists() {
        let _ = std::fs::create_dir_all(&path);
    }

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
    let mut db_path = std::env::current_dir().unwrap_or_default();
    db_path.push("data");
    db_path.push("maps");
    db_path.push("compiled");
    db_path.push("map.mbtiles");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(MbtilesState { db_path })
        .invoke_handler(tauri::generate_handler![get_tile])
        .setup(|app| {
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
        .on_menu_event(|_app, event| {
            match event.id().as_ref() {
                "quit" => {
                    _app.exit(0);
                }
                "open_maps_folder" => {
                    open_maps_folder();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
