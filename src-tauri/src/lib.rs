mod backup;
mod commands;
pub mod credentials;
pub mod models;
pub mod probe;
pub mod provider_store;
mod system_env;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::runtime_info,
            commands::get_launch_readiness,
            commands::get_credential_status,
            commands::save_credential,
            commands::delete_credential,
            commands::sync_provider_catalog,
            commands::get_user_route_status,
            commands::launch_claude,
            commands::apply_user_route,
            commands::clear_user_route,
            commands::rollback_user_route,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CC Router");
}
