use std::sync::atomic::{AtomicBool, Ordering};

static FORCE_QUIT: AtomicBool = AtomicBool::new(false);
static AUTOMATION_SHUTDOWN: AtomicBool = AtomicBool::new(false);

pub fn request_force_quit() {
    FORCE_QUIT.store(true, Ordering::SeqCst);
    AUTOMATION_SHUTDOWN.store(true, Ordering::SeqCst);
}

pub fn is_force_quit_requested() -> bool {
    FORCE_QUIT.load(Ordering::SeqCst)
}

pub fn automation_should_stop() -> bool {
    AUTOMATION_SHUTDOWN.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_force_quit_sets_shutdown_flags() {
        request_force_quit();
        assert!(is_force_quit_requested());
        assert!(automation_should_stop());
    }
}
