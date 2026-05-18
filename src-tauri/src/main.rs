mod actions;
mod analytics;
mod catalog;
mod storage;
mod usage;
mod windowing;

use analytics::DashboardData;

fn build_dashboard_data() -> Result<DashboardData, String> {
    let mut catalog = catalog::scan_skill_catalog()?;
    storage::apply_localized_notes(&mut catalog)?;
    let usage = usage::scan_codex_usage()?;
    let mut data = analytics::build_dashboard(catalog, usage);
    storage::persist_and_merge_daily(&mut data.summary)?;
    Ok(data)
}

#[tauri::command]
fn refresh_usage() -> Result<DashboardData, String> {
    build_dashboard_data()
}

#[tauri::command]
fn get_settings() -> Result<storage::SkillPulseSettings, String> {
    storage::load_settings()
}

#[tauri::command]
fn set_custom_icon_path(path: String) -> Result<storage::SkillPulseSettings, String> {
    storage::set_custom_icon(&path)
}

#[tauri::command]
fn restore_default_icon() -> Result<storage::SkillPulseSettings, String> {
    storage::restore_default_icon()
}

#[tauri::command]
fn save_skill_note(skill_path: String, note: String) -> Result<(), String> {
    storage::save_skill_note(&skill_path, &note)
}

#[tauri::command]
fn generate_skill_annotations() -> Result<DashboardData, String> {
    let catalog = catalog::scan_skill_catalog()?;
    storage::generate_skill_annotations(&catalog)?;
    build_dashboard_data()
}

#[tauri::command]
fn export_skill_annotation_request() -> Result<Vec<String>, String> {
    let catalog = catalog::scan_skill_catalog()?;
    storage::export_translation_request(&catalog)
}

#[tauri::command]
fn export_skill_annotation_batches(batch_size: usize) -> Result<Vec<String>, String> {
    let catalog = catalog::scan_skill_catalog()?;
    storage::export_translation_request_batches(&catalog, batch_size)
}

#[tauri::command]
fn export_skill_annotation_selected(skill_ids: Vec<String>) -> Result<Vec<String>, String> {
    let catalog = catalog::scan_skill_catalog()?;
    storage::export_translation_request_selected(&catalog, &skill_ids)
}

#[tauri::command]
fn import_skill_annotation_result(path: String) -> Result<DashboardData, String> {
    let catalog = catalog::scan_skill_catalog()?;
    storage::import_translation_result(&catalog, &path)?;
    build_dashboard_data()
}

#[tauri::command]
fn import_latest_skill_annotation_result() -> Result<DashboardData, String> {
    let catalog = catalog::scan_skill_catalog()?;
    storage::import_latest_translation_result(&catalog)?;
    build_dashboard_data()
}

#[tauri::command]
fn list_skill_annotation_results() -> Result<Vec<storage::TranslationResultCandidate>, String> {
    storage::list_translation_result_candidates()
}

#[tauri::command]
fn open_panel(app: tauri::AppHandle) -> Result<(), String> {
    windowing::show_panel(&app)
}

#[tauri::command]
fn hide_panel(app: tauri::AppHandle) -> Result<(), String> {
    windowing::hide_panel(&app)
}

#[tauri::command]
fn set_panel_expanded(app: tauri::AppHandle, expanded: bool) -> Result<(), String> {
    windowing::set_panel_expanded(&app, expanded)
}

#[tauri::command]
fn show_dock_menu(app: tauri::AppHandle) -> Result<(), String> {
    windowing::show_dock_menu(&app)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    actions::open_path(&path)
}

#[tauri::command]
fn export_usage_json() -> Result<String, String> {
    let data = build_dashboard_data()?;
    actions::export_json(&data)
}

#[tauri::command]
fn export_usage_csv() -> Result<String, String> {
    let data = build_dashboard_data()?;
    actions::export_csv(&data)
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            refresh_usage,
            get_settings,
            set_custom_icon_path,
            restore_default_icon,
            save_skill_note,
            generate_skill_annotations,
            export_skill_annotation_request,
            export_skill_annotation_batches,
            export_skill_annotation_selected,
            import_skill_annotation_result,
            import_latest_skill_annotation_result,
            list_skill_annotation_results,
            open_panel,
            hide_panel,
            set_panel_expanded,
            show_dock_menu,
            open_path,
            export_usage_json,
            export_usage_csv,
            quit_app
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            windowing::initialize_windows(&handle);
            windowing::start_window_follow(handle);
            Ok(())
        })
        .on_menu_event(|app, event| {
            windowing::handle_menu_event(app, event);
        })
        .run(tauri::generate_context!())
        .expect("error while running SkillPulse");
}
