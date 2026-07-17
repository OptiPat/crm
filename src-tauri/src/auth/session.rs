use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};
use tauri::State;

pub const UI_SESSION_LOCKED_EVENT: &str = "ui-session-locked";

#[derive(Debug, Clone, Copy)]
struct ActivityTime {
    monotonic: Instant,
    wall: SystemTime,
}

impl ActivityTime {
    fn now() -> Self {
        Self {
            monotonic: Instant::now(),
            wall: SystemTime::now(),
        }
    }

    fn elapsed_at(self, monotonic: Instant, wall: SystemTime) -> Duration {
        monotonic
            .saturating_duration_since(self.monotonic)
            .max(wall.duration_since(self.wall).unwrap_or(Duration::ZERO))
    }
}

/// État d'accès de l'interface, distinct de la connexion SQLite.
///
/// Un verrouillage automatique ferme l'interface sans fermer la base afin que
/// les automatisations en tray puissent continuer. Les commandes IPC sensibles
/// doivent donc vérifier explicitement cet état.
#[derive(Debug)]
pub struct UiSessionState {
    unlocked: AtomicBool,
    last_activity: Mutex<ActivityTime>,
}

impl Default for UiSessionState {
    fn default() -> Self {
        Self {
            unlocked: AtomicBool::new(false),
            last_activity: Mutex::new(ActivityTime::now()),
        }
    }
}

impl UiSessionState {
    pub fn is_unlocked(&self) -> bool {
        self.unlocked.load(Ordering::Acquire)
    }

    pub fn unlock(&self) {
        if let Ok(mut last_activity) = self.last_activity.lock() {
            *last_activity = ActivityTime::now();
        }
        self.unlocked.store(true, Ordering::Release);
    }

    pub fn lock(&self) -> bool {
        self.unlocked.swap(false, Ordering::AcqRel)
    }

    /// Enregistre une activité seulement si le délai n'était pas déjà dépassé.
    /// Retourne `false` si la session était ou vient d'être verrouillée.
    pub fn touch_or_lock_if_idle(&self, timeout: Duration) -> bool {
        self.touch_or_lock_if_idle_at(Instant::now(), SystemTime::now(), timeout)
    }

    fn touch_or_lock_if_idle_at(
        &self,
        now: Instant,
        wall_now: SystemTime,
        timeout: Duration,
    ) -> bool {
        let Ok(mut last_activity) = self.last_activity.lock() else {
            return false;
        };
        if !self.is_unlocked() {
            return false;
        }
        if !timeout.is_zero() && last_activity.elapsed_at(now, wall_now) >= timeout {
            self.unlocked.store(false, Ordering::Release);
            return false;
        }
        *last_activity = ActivityTime {
            monotonic: now,
            wall: wall_now,
        };
        true
    }

    /// Verrouille une session inactive et indique si une transition a eu lieu.
    pub fn lock_if_idle(&self, timeout: Duration) -> bool {
        self.lock_if_idle_at(Instant::now(), SystemTime::now(), timeout)
    }

    fn lock_if_idle_at(&self, now: Instant, wall_now: SystemTime, timeout: Duration) -> bool {
        if timeout.is_zero() {
            return false;
        }
        let Ok(last_activity) = self.last_activity.lock() else {
            return false;
        };
        if !self.is_unlocked() || last_activity.elapsed_at(now, wall_now) < timeout {
            return false;
        }
        self.unlocked.swap(false, Ordering::AcqRel)
    }

    pub fn require_unlocked(&self) -> Result<(), String> {
        if self.is_unlocked() {
            Ok(())
        } else {
            Err("Session verrouillée : déverrouillez le CRM pour continuer.".to_string())
        }
    }
}

pub fn require_ui_session(session: &State<'_, UiSessionState>) -> Result<(), String> {
    session.require_unlocked()
}

#[cfg(test)]
mod tests {
    use super::{ActivityTime, UiSessionState};
    use std::time::{Duration, Instant, SystemTime};

    #[test]
    fn session_starts_locked_and_can_toggle_without_touching_database() {
        let session = UiSessionState::default();
        assert!(!session.is_unlocked());
        assert!(session.require_unlocked().is_err());

        session.unlock();
        assert!(session.is_unlocked());
        assert!(session.require_unlocked().is_ok());

        assert!(session.lock());
        assert!(!session.is_unlocked());
    }

    #[test]
    fn first_activity_after_elapsed_timeout_locks_instead_of_resetting_idle() {
        let session = UiSessionState::default();
        let started = Instant::now();
        let wall_started = SystemTime::now();
        session.unlock();
        *session.last_activity.lock().unwrap() = ActivityTime {
            monotonic: started,
            wall: wall_started,
        };

        assert!(!session.touch_or_lock_if_idle_at(
            started + Duration::from_secs(16 * 60),
            wall_started + Duration::from_secs(16 * 60),
            Duration::from_secs(15 * 60),
        ));
        assert!(!session.is_unlocked());
    }

    #[test]
    fn worker_locks_only_after_configured_idle_delay() {
        let session = UiSessionState::default();
        let started = Instant::now();
        let wall_started = SystemTime::now();
        session.unlock();
        *session.last_activity.lock().unwrap() = ActivityTime {
            monotonic: started,
            wall: wall_started,
        };

        assert!(!session.lock_if_idle_at(
            started + Duration::from_secs(14 * 60),
            wall_started + Duration::from_secs(14 * 60),
            Duration::from_secs(15 * 60),
        ));
        assert!(session.is_unlocked());
        assert!(session.lock_if_idle_at(
            started + Duration::from_secs(15 * 60),
            wall_started + Duration::from_secs(15 * 60),
            Duration::from_secs(15 * 60),
        ));
        assert!(!session.is_unlocked());
    }

    #[test]
    fn wall_clock_detects_sleep_when_monotonic_clock_does_not_advance() {
        let session = UiSessionState::default();
        let started = Instant::now();
        let wall_started = SystemTime::now();
        session.unlock();
        *session.last_activity.lock().unwrap() = ActivityTime {
            monotonic: started,
            wall: wall_started,
        };

        assert!(session.lock_if_idle_at(
            started,
            wall_started + Duration::from_secs(60 * 60),
            Duration::from_secs(15 * 60),
        ));
    }
}
