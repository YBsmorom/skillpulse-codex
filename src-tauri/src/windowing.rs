use once_cell::sync::Lazy;
use std::{sync::Mutex, thread, time::Duration};
use tauri::{
    menu::MenuBuilder, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Position,
    Size,
};

use crate::actions;

#[cfg(windows)]
use windows::{
    core::BOOL,
    Win32::{
        Foundation::{HWND, LPARAM, POINT, RECT},
        UI::{
            Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON},
            WindowsAndMessaging::{
                EnumWindows, GetCursorPos, GetParent, GetWindowLongPtrW, GetWindowRect,
                GetWindowTextLengthW, GetWindowTextW, IsIconic, IsWindowVisible, SetParent,
                SetWindowLongPtrW, SetWindowPos, GWL_STYLE, HWND_TOP, SWP_FRAMECHANGED,
                SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_SHOWWINDOW, WS_CHILD, WS_POPUP, WS_VISIBLE,
            },
        },
    },
};

static LAST_CODEX_RECT: Lazy<Mutex<Option<CodexRect>>> = Lazy::new(|| Mutex::new(None));
static PANEL_OPEN: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
static LAST_DOCK_PLACEMENT: Lazy<Mutex<Option<DockPlacement>>> = Lazy::new(|| Mutex::new(None));

const DOCK_SIZE: f64 = 16.0;
const DOCK_PHYSICAL_SIZE: i32 = 24;
const DOCK_X_OFFSET: i32 = 629;
const DOCK_Y_OFFSET: i32 = 15;
const PANEL_WIDTH: u32 = 1440;
const PANEL_HEIGHT: u32 = 900;
const PANEL_MARGIN: i32 = 24;

#[derive(Clone, Copy, Debug)]
struct CodexRect {
    hwnd: isize,
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[derive(Clone, Copy, Debug)]
struct WorkArea {
    left: i32,
    top: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct DockPlacement {
    parent_hwnd: isize,
    x: i32,
    y: i32,
    size: i32,
}

#[cfg(windows)]
#[derive(Default)]
struct DockInputState {
    left_down: bool,
}

#[derive(Clone, Copy)]
pub enum PanelMode {
    Panel,
    Expanded,
}

pub fn initialize_windows(app: &tauri::AppHandle) {
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.set_focusable(true);
        let _ = dock.set_ignore_cursor_events(false);
        let _ = dock.set_shadow(false);
        let _ = dock.set_always_on_top(true);
        let _ = dock.set_size(Size::Logical(LogicalSize::new(DOCK_SIZE, DOCK_SIZE)));
    }
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.set_focusable(true);
        let _ = panel.set_shadow(false);
        let _ = park_panel(&panel);
    }
}

pub fn start_window_follow(app: tauri::AppHandle) {
    #[cfg(windows)]
    start_dock_input_watch(app.clone());

    thread::spawn(move || loop {
        let rect = find_codex_window();
        if let Ok(mut last_rect) = LAST_CODEX_RECT.lock() {
            *last_rect = rect;
        }

        if let Some(dock) = app.get_webview_window("dock") {
            if rect.is_none() {
                hide_if_visible(&dock);
                clear_dock_placement();
                if let Some(panel) = app.get_webview_window("panel") {
                    let _ = park_panel(&panel);
                }
                set_panel_open(false);
                thread::sleep(Duration::from_millis(900));
                continue;
            }

            let panel_open = PANEL_OPEN.lock().map(|state| *state).unwrap_or(false);
            if panel_open {
                hide_if_visible(&dock);
            } else {
                if apply_dock_geometry(&app).unwrap_or(false) {
                    show_if_hidden(&dock);
                } else {
                    hide_if_visible(&dock);
                }
            }
        }

        thread::sleep(Duration::from_millis(900));
    });
}

#[cfg(windows)]
fn start_dock_input_watch(app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut state = DockInputState::default();
        loop {
            handle_native_dock_input(&app, &mut state);
            thread::sleep(Duration::from_millis(35));
        }
    });
}

#[cfg(windows)]
fn handle_native_dock_input(app: &tauri::AppHandle, state: &mut DockInputState) {
    let left_down = unsafe { (GetAsyncKeyState(VK_LBUTTON.0.into()) as u16 & 0x8000) != 0 };
    let open = PANEL_OPEN.lock().map(|state| *state).unwrap_or(false);
    if open {
        state.left_down = left_down;
        return;
    }

    if left_down && !state.left_down && cursor_inside_dock(app) {
        let _ = show_panel(app);
    }
    state.left_down = left_down;
}

#[cfg(windows)]
fn cursor_inside_dock(app: &tauri::AppHandle) -> bool {
    let Some(dock) = app.get_webview_window("dock") else {
        return false;
    };
    if !dock.is_visible().unwrap_or(false) {
        return false;
    }
    let Ok(tauri_dock_hwnd) = dock.hwnd() else {
        return false;
    };
    let dock_hwnd = HWND(tauri_dock_hwnd.0 as _);
    unsafe {
        let mut point = POINT::default();
        if GetCursorPos(&mut point).is_err() {
            return false;
        }
        let mut rect = RECT::default();
        if GetWindowRect(dock_hwnd, &mut rect).is_err() {
            return false;
        }
        point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom
    }
}

pub fn show_panel(app: &tauri::AppHandle) -> Result<(), String> {
    apply_panel_geometry(app, PanelMode::Panel)?;
    set_panel_open(true);
    if let Some(dock) = app.get_webview_window("dock") {
        hide_if_visible(&dock);
    }
    Ok(())
}

pub fn hide_panel(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(panel) = app.get_webview_window("panel") else {
        set_panel_open(false);
        return Ok(());
    };
    let _ = panel.set_fullscreen(false);
    park_panel(&panel)?;
    set_panel_open(false);
    if let Some(dock) = app.get_webview_window("dock") {
        if apply_dock_geometry(app)? {
            show_if_hidden(&dock);
        } else {
            hide_if_visible(&dock);
        }
    }
    Ok(())
}

pub fn set_panel_expanded(app: &tauri::AppHandle, expanded: bool) -> Result<(), String> {
    set_panel_open(true);
    if expanded {
        apply_panel_geometry(app, PanelMode::Expanded)
    } else {
        apply_panel_geometry(app, PanelMode::Panel)
    }
}

fn set_panel_open(open: bool) {
    if let Ok(mut state) = PANEL_OPEN.lock() {
        *state = open;
    }
}

fn clear_dock_placement() {
    if let Ok(mut state) = LAST_DOCK_PLACEMENT.lock() {
        *state = None;
    }
}

fn show_if_hidden(window: &tauri::WebviewWindow) {
    if !window.is_visible().unwrap_or(false) {
        let _ = window.show();
    }
}

fn hide_if_visible(window: &tauri::WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    }
}

pub fn show_dock_menu(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(dock) = app.get_webview_window("dock") else {
        return Ok(());
    };
    let menu = MenuBuilder::new(app)
        .text("open_panel", "打开面板")
        .text("refresh_usage", "刷新统计")
        .text("open_skill_root", "打开 Skill 目录")
        .separator()
        .text("quit", "退出 SkillPulse")
        .build()
        .map_err(|err| err.to_string())?;
    dock.popup_menu(&menu).map_err(|err| err.to_string())
}

pub fn handle_menu_event(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    if event.id() == "open_panel" {
        let _ = show_panel(app);
    } else if event.id() == "refresh_usage" {
        let _ = app.emit("skillpulse-refresh-request", ());
    } else if event.id() == "open_skill_root" {
        let _ = actions::open_default_skill_root();
    } else if event.id() == "quit" {
        app.exit(0);
    }
}

fn apply_dock_geometry(app: &tauri::AppHandle) -> Result<bool, String> {
    let Some(dock) = app.get_webview_window("dock") else {
        return Ok(false);
    };
    let rect = *LAST_CODEX_RECT
        .lock()
        .map_err(|_| "codex rect lock poisoned".to_string())?;
    dock.set_size(Size::Logical(LogicalSize::new(DOCK_SIZE, DOCK_SIZE)))
        .map_err(|err| err.to_string())?;
    let _ = dock.set_ignore_cursor_events(false);
    let Some(rect) = rect else {
        return Ok(false);
    };
    apply_dock_child_geometry(&dock, rect)?;
    Ok(true)
}

#[cfg(windows)]
fn apply_dock_child_geometry(dock: &tauri::WebviewWindow, rect: CodexRect) -> Result<(), String> {
    let tauri_dock_hwnd = dock.hwnd().map_err(|err| err.to_string())?;
    let dock_hwnd = HWND(tauri_dock_hwnd.0 as _);
    let codex_hwnd = HWND(rect.hwnd as _);
    let placement = DockPlacement {
        parent_hwnd: rect.hwnd,
        x: DOCK_X_OFFSET,
        y: DOCK_Y_OFFSET,
        size: DOCK_PHYSICAL_SIZE,
    };

    if LAST_DOCK_PLACEMENT
        .lock()
        .map_err(|_| "dock placement lock poisoned".to_string())?
        .as_ref()
        .is_some_and(|previous| *previous == placement)
    {
        return Ok(());
    }

    unsafe {
        let reparented = GetParent(dock_hwnd)
            .map(|current_parent| current_parent != codex_hwnd)
            .unwrap_or(true);
        if reparented {
            let _ = SetParent(dock_hwnd, Some(codex_hwnd));
        }
        let style = GetWindowLongPtrW(dock_hwnd, GWL_STYLE) as u32;
        let child_style = (style & !WS_POPUP.0) | WS_CHILD.0 | WS_VISIBLE.0;
        let restyled = style != child_style;
        if restyled {
            let _ = SetWindowLongPtrW(dock_hwnd, GWL_STYLE, child_style as isize);
        }
        let mut flags = SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_SHOWWINDOW;
        if reparented || restyled {
            flags |= SWP_FRAMECHANGED;
        }
        SetWindowPos(
            dock_hwnd,
            Some(HWND_TOP),
            placement.x,
            placement.y,
            placement.size,
            placement.size,
            flags,
        )
        .map_err(|err| err.to_string())?;
    }
    if let Ok(mut state) = LAST_DOCK_PLACEMENT.lock() {
        *state = Some(placement);
    }
    Ok(())
}

#[cfg(not(windows))]
fn apply_dock_child_geometry(dock: &tauri::WebviewWindow, rect: CodexRect) -> Result<(), String> {
    let (x, y) = (rect.left + DOCK_X_OFFSET, rect.top + DOCK_Y_OFFSET);
    dock.set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|err| err.to_string())
}

fn apply_panel_geometry(app: &tauri::AppHandle, mode: PanelMode) -> Result<(), String> {
    let Some(panel) = app.get_webview_window("panel") else {
        return Ok(());
    };
    let _ = panel.set_focusable(true);
    let _ = panel.set_skip_taskbar(false);
    panel.show().map_err(|err| err.to_string())?;

    if matches!(mode, PanelMode::Expanded) {
        let _ = panel.set_fullscreen(false);
        let rect = *LAST_CODEX_RECT
            .lock()
            .map_err(|_| "codex rect lock poisoned".to_string())?;
        if let Some(area) = work_area_for_rect(app, rect) {
            panel
                .set_size(Size::Physical(PhysicalSize::new(area.width, area.height)))
                .map_err(|err| err.to_string())?;
            panel
                .set_position(Position::Physical(PhysicalPosition::new(
                    area.left, area.top,
                )))
                .map_err(|err| err.to_string())?;
        } else {
            panel.set_fullscreen(true).map_err(|err| err.to_string())?;
        }
        panel.set_focus().map_err(|err| err.to_string())?;
        return Ok(());
    }

    let _ = panel.set_fullscreen(false);
    let rect = *LAST_CODEX_RECT
        .lock()
        .map_err(|_| "codex rect lock poisoned".to_string())?;
    let work_area = work_area_for_rect(app, rect);
    let width = work_area
        .map(|area| PANEL_WIDTH.min(area.width.saturating_sub((PANEL_MARGIN * 2) as u32)))
        .unwrap_or(PANEL_WIDTH)
        .max(960);
    let height = work_area
        .map(|area| PANEL_HEIGHT.min(area.height.saturating_sub((PANEL_MARGIN * 2) as u32)))
        .unwrap_or(PANEL_HEIGHT)
        .max(620);
    panel
        .set_size(Size::Physical(PhysicalSize::new(width, height)))
        .map_err(|err| err.to_string())?;

    let (x, y) = panel_origin(work_area);
    panel
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|err| err.to_string())?;
    panel.set_focus().map_err(|err| err.to_string())?;
    Ok(())
}

fn panel_origin(work_area: Option<WorkArea>) -> (i32, i32) {
    work_area
        .map(|area| (area.left + PANEL_MARGIN, area.top + PANEL_MARGIN))
        .unwrap_or((PANEL_MARGIN, PANEL_MARGIN))
}

fn park_panel(panel: &tauri::WebviewWindow) -> Result<(), String> {
    let _ = panel.set_focusable(false);
    let _ = panel.set_skip_taskbar(true);
    let _ = panel.set_size(Size::Physical(PhysicalSize::new(1, 1)));
    let _ = panel.set_position(Position::Physical(PhysicalPosition::new(-32000, -32000)));
    panel.hide().map_err(|err| err.to_string())
}

fn work_area_for_rect(app: &tauri::AppHandle, rect: Option<CodexRect>) -> Option<WorkArea> {
    let monitors = app.available_monitors().ok()?;
    let center = rect.map(|rect| ((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2));

    let selected = monitors
        .iter()
        .find(|monitor| {
            let area = monitor.work_area();
            let left = area.position.x;
            let top = area.position.y;
            let right = left + area.size.width as i32;
            let bottom = top + area.size.height as i32;
            center
                .map(|(x, y)| x >= left && x <= right && y >= top && y <= bottom)
                .unwrap_or(false)
        })
        .or_else(|| monitors.first())?;

    let area = selected.work_area();
    Some(WorkArea {
        left: area.position.x,
        top: area.position.y,
        width: area.size.width,
        height: area.size.height,
    })
}

#[cfg(windows)]
fn find_codex_window() -> Option<CodexRect> {
    struct EnumState {
        found: Option<CodexRect>,
        best_area: i32,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return BOOL(1);
        }

        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return BOOL(1);
        }

        let mut buffer = vec![0u16; (len + 1) as usize];
        let copied = GetWindowTextW(hwnd, &mut buffer);
        if copied <= 0 {
            return BOOL(1);
        }

        let title = String::from_utf16_lossy(&buffer[..copied as usize]);
        let title_lower = title.to_ascii_lowercase();
        if !title_lower.contains("codex") || title_lower.contains("skillpulse") {
            return BOOL(1);
        }

        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_ok()
            && rect.right > rect.left
            && rect.bottom > rect.top
        {
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            if width < 800 || height < 500 {
                return BOOL(1);
            }
            let area = width * height;
            let state = &mut *(lparam.0 as *mut EnumState);
            if area > state.best_area {
                state.best_area = area;
                state.found = Some(CodexRect {
                    hwnd: hwnd.0 as isize,
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                });
            }
        }

        BOOL(1)
    }

    let mut state = EnumState {
        found: None,
        best_area: 0,
    };
    unsafe {
        let _ = EnumWindows(
            Some(enum_proc),
            LPARAM((&mut state as *mut EnumState) as isize),
        );
    }
    state.found
}

#[cfg(not(windows))]
fn find_codex_window() -> Option<CodexRect> {
    None
}
