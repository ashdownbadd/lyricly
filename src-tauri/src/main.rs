#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod oauth_server;

use device_query::{DeviceQuery, DeviceState};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[tauri::command]
fn start_oauth_server(app: AppHandle, port: u16) -> Result<(), String> {
    oauth_server::start(app, port)
}

#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("settings")
        .ok_or_else(|| "Lyricly Settings window was not initialized".to_string())?;

    // Put Settings on the right side of the monitor containing the overlay.
    // Use physical coordinates because Tauri's monitor geometry is physical.
    if let Some(main) = app.get_webview_window("main") {
        if let Some(monitor) = main.current_monitor().map_err(|e| e.to_string())? {
            let monitor_size = monitor.size();
            let monitor_pos = monitor.position();
            let settings_size = window.outer_size().map_err(|e| e.to_string())?;
            let margin = 24i32;
            let x = monitor_pos.x + (monitor_size.width as i32 - settings_size.width as i32 - margin).max(0);
            let y = monitor_pos.y + ((monitor_size.height as i32 - settings_size.height as i32) / 2).max(0);
            window
                .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, y)))
                .map_err(|e| e.to_string())?;
        }
    }

    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn close_settings(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("settings")
        .ok_or_else(|| "Lyricly Settings window was not initialized".to_string())?;
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_overlay_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window was not initialized".to_string())?;

    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No monitor found for the main window".to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    let max_x = (monitor.size().width as f64 - size.width as f64).max(0.0);
    let max_y = (monitor.size().height as f64 - size.height as f64).max(0.0);
    let left = monitor.position().x as f64 + max_x * x.clamp(0.0, 100.0) / 100.0;
    let top = monitor.position().y as f64 + max_y * y.clamp(0.0, 100.0) / 100.0;

    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
            left.round() as i32,
            top.round() as i32,
        )))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Resizes the overlay AND repositions it against the *target* size in one
/// atomic native call, for the lyric-driven auto-fit resize path.
///
/// The previous approach called `setSize()` from the frontend, then invoked
/// `set_overlay_position` separately, which re-derives left/top from
/// `window.outer_size()`. Because `setSize()` can resolve slightly before
/// the OS has actually finished applying the new size, that second call
/// would sometimes read the *previous* width back — landing the "centered"
/// math a few pixels off, since only the left edge had moved and the width
/// used to compute centering was stale. Taking width/height directly as
/// parameters here means the position math never depends on querying
/// anything that could still be mid-flight.
#[tauri::command]
fn resize_and_reposition(app: AppHandle, width: f64, height: f64, x: f64, y: f64) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window was not initialized".to_string())?;

    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No monitor found for the main window".to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let physical_width = (width * scale).round().max(1.0);
    let physical_height = (height * scale).round().max(1.0);

    let max_x = (monitor.size().width as f64 - physical_width).max(0.0);
    let max_y = (monitor.size().height as f64 - physical_height).max(0.0);
    let left = monitor.position().x as f64 + max_x * x.clamp(0.0, 100.0) / 100.0;
    let top = monitor.position().y as f64 + max_y * y.clamp(0.0, 100.0) / 100.0;

    window
        .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
            physical_width as u32,
            physical_height as u32,
        )))
        .map_err(|e| e.to_string())?;
    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
            left.round() as i32,
            top.round() as i32,
        )))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(url).map_err(|e| e.to_string())
}

// Constructing DeviceState touches native input APIs (Quartz Event Services on
// macOS, raw input on Windows), so it's created once and reused — not on every poll.
static DEVICE_STATE: OnceLock<DeviceState> = OnceLock::new();

/// Returns the mouse cursor's position in *global screen* (physical pixel)
/// coordinates, the same coordinate space as `window.outerPosition()`.
///
/// This exists specifically because `setIgnoreCursorEvents(true)` stops the
/// window from receiving any mouse events at all — including mousemove — so
/// the frontend can't use ordinary DOM listeners to notice the cursor has
/// re-entered an interactive region like the drag handle. Polling the real
/// OS cursor position works regardless of the window's current click-through
/// state, which is what makes selective (per-region) click-through possible.
#[tauri::command]
fn get_cursor_position() -> (f64, f64) {
    let state = DEVICE_STATE.get_or_init(DeviceState::new);
    let mouse = state.get_mouse();
    (mouse.coords.0 as f64, mouse.coords.1 as f64)
}

fn main() {
    let click_through_shortcut = Shortcut::new(
        Some(Modifiers::SHIFT | Modifiers::CONTROL | Modifiers::ALT),
        Code::KeyL,
    );
    let settings_shortcut = Shortcut::new(
        Some(Modifiers::SHIFT | Modifiers::CONTROL),
        Code::KeyO,
    );
    let shortcut_for_handler = click_through_shortcut.clone();
    let shortcut_for_settings = settings_shortcut.clone();
    let shortcut_for_setup = click_through_shortcut.clone();
    let settings_for_setup = settings_shortcut.clone();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &shortcut_for_handler {
                        let _ = app.emit("toggle-click-through", ());
                    } else if shortcut == &shortcut_for_settings {
                        let _ = app.emit("open-settings", ());
                    }
                })
                .build(),
        )
        .setup(move |app| {
            // Give the overlay a deterministic bottom-center startup position.
            // The renderer may later restore a user's persisted custom position,
            // but the native window must never start at an old/top coordinate.
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    if let Ok(size) = window.outer_size() {
                        let max_x = (monitor.size().width as i64 - size.width as i64).max(0);
                        let max_y = (monitor.size().height as i64 - size.height as i64).max(0);
                        let left = monitor.position().x as i64 + ((max_x as f64) * 0.50).round() as i64;
                        let top = monitor.position().y as i64 + ((max_y as f64) * 0.88).round() as i64;
                        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                            left as i32,
                            top as i32,
                        )));
                    }
                }
            }

            if let Err(e) = app.global_shortcut().register(shortcut_for_setup.clone()) {
                eprintln!("Warning: could not register global shortcut Ctrl+Alt+Shift+L ({e}).");
            }
            if let Err(e) = app.global_shortcut().register(settings_for_setup.clone()) {
                eprintln!("Warning: could not register global shortcut Ctrl+Shift+O ({e}).");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_oauth_server,
            open_settings,
            close_settings,
            set_overlay_position,
            resize_and_reposition,
            open_url,
            get_cursor_position
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lyricly");
}
