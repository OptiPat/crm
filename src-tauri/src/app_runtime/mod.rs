mod commands;
mod prefs;
mod shutdown;
mod tray;
mod worker;

pub use commands::{
    focus_main_window_cmd, get_app_runtime_prefs, quit_app_fully_cmd, save_app_runtime_prefs,
    save_auto_lock_minutes,
};
pub use prefs::{guard_dev_autostart_boot, load_runtime_prefs};
pub use shutdown::is_force_quit_requested;
pub use tray::{
    apply_startup_launch_prefs, focus_main_window, hide_main_window_if_minimized_arg, setup_tray,
};
pub use worker::start_background_automation_worker;
