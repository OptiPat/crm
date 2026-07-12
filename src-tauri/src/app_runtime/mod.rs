mod commands;
mod prefs;
mod tray;
mod worker;

pub use commands::{get_app_runtime_prefs, quit_app_fully_cmd, save_app_runtime_prefs};
pub use prefs::load_runtime_prefs;
pub use tray::{apply_startup_launch_prefs, hide_main_window_if_minimized_arg, setup_tray};
pub use worker::start_pipe_rdv_reminder_worker;
