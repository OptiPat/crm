//! Étalement des envois SMTP (boîte « autre messagerie ») : quota horaire en fenêtre
//! glissante, pour rester sous la limite de l'hébergeur (OVH : ~200 / heure / compte).
//!
//! Les envois groupés interrogent [`quota_status`] et attendent côté front, avec une marge
//! (10 %) laissée aux envois unitaires (rappels RDV, réponses) ; l'envoi lui-même refuse
//! au-delà du quota complet.

use super::imap_mailbox::IMAP_PROVIDER;
use super::oauth_store::EmailOAuthStore;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

pub const DEFAULT_HOURLY_LIMIT: u32 = 150;
/// Début du message de refus : reconnu côté front (`isSmtpQuotaError`) pour attendre et
/// réessayer au lieu de compter une erreur.
pub const QUOTA_ERROR_MARK: &str = "Limite d'envoi atteinte";
pub const MAX_HOURLY_LIMIT: u32 = 10_000;
const WINDOW_SECS: i64 = 3600;
static QUOTA_IO_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Default, Serialize, Deserialize)]
struct QuotaFile {
    #[serde(default)]
    hourly_limit: Option<u32>,
    /// Horodatages (unix s) des envois SMTP réussis de la dernière heure.
    #[serde(default)]
    sent_at: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SmtpSendQuota {
    /// Boîte SMTP connectée : quota appliqué (Google / Microsoft : non).
    pub applies: bool,
    pub hourly_limit: u32,
    pub sent_last_hour: u32,
    /// Attente avant le prochain envoi unitaire autorisé (0 = tout de suite).
    pub wait_seconds: i64,
    /// Attente pour un envoi groupé : pause plus tôt, à `hourly_limit - marge`.
    pub batch_wait_seconds: i64,
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("smtp_send_quota.json"))
}

fn load(app: &AppHandle) -> Result<QuotaFile, String> {
    let path = path(app)?;
    if !path.exists() {
        return Ok(QuotaFile::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    // Fichier abîmé : compteur remis à zéro plutôt que de bloquer tout envoi, mais la
    // limite choisie est conservée si elle reste lisible.
    Ok(serde_json::from_str(&raw).unwrap_or_else(|_| QuotaFile {
        hourly_limit: serde_json::from_str::<serde_json::Value>(&raw)
            .ok()
            .and_then(|v| v.get("hourly_limit")?.as_u64())
            .and_then(|l| u32::try_from(l).ok()),
        sent_at: vec![],
    }))
}

fn save(app: &AppHandle, file: &QuotaFile) -> Result<(), String> {
    let path = path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(file).map_err(|e| e.to_string())?;
    crate::atomic_file::write(&path, json).map_err(|e| e.to_string())
}

fn with_lock<T>(f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _guard = QUOTA_IO_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Verrou du quota d'envoi indisponible.".to_string())?;
    f()
}

fn effective_limit(file: &QuotaFile) -> u32 {
    file.hourly_limit
        .filter(|l| (1..=MAX_HOURLY_LIMIT).contains(l))
        .unwrap_or(DEFAULT_HOURLY_LIMIT)
}

/// Seuil des envois groupés : 10 % du quota laissé aux envois unitaires.
fn batch_limit(limit: u32) -> u32 {
    (limit - limit / 10).max(1)
}

/// Envois encore dans la fenêtre d'une heure, du plus ancien au plus récent.
fn recent_sends(sent_at: &[i64], now: i64) -> Vec<i64> {
    let mut recent: Vec<i64> = sent_at
        .iter()
        .copied()
        .filter(|ts| *ts > now - WINDOW_SECS && *ts <= now + 60)
        .collect();
    recent.sort_unstable();
    recent
}

/// Secondes avant qu'un envoi de plus reste sous `limit` envois par heure glissante.
fn wait_seconds(sent_at: &[i64], limit: u32, now: i64) -> i64 {
    let recent = recent_sends(sent_at, now);
    let limit = limit.max(1) as usize;
    if recent.len() < limit {
        return 0;
    }
    // Il faut que l'envoi en position `len - limit` sorte de la fenêtre.
    let oldest_blocking = recent[recent.len() - limit];
    (oldest_blocking + WINDOW_SECS - now + 1).max(0)
}

fn mailbox_uses_smtp(app: &AppHandle) -> bool {
    EmailOAuthStore::load(app)
        .ok()
        .and_then(|s| s.connection)
        .is_some_and(|c| c.provider == IMAP_PROVIDER)
}

pub fn quota_status(app: &AppHandle) -> Result<SmtpSendQuota, String> {
    let applies = mailbox_uses_smtp(app);
    let now = EmailOAuthStore::now_unix();
    with_lock(|| {
        let file = load(app)?;
        let limit = effective_limit(&file);
        Ok(SmtpSendQuota {
            applies,
            hourly_limit: limit,
            sent_last_hour: recent_sends(&file.sent_at, now).len() as u32,
            wait_seconds: if applies {
                wait_seconds(&file.sent_at, limit, now)
            } else {
                0
            },
            batch_wait_seconds: if applies {
                wait_seconds(&file.sent_at, batch_limit(limit), now)
            } else {
                0
            },
        })
    })
}

pub fn set_hourly_limit(app: &AppHandle, limit: u32) -> Result<(), String> {
    if !(1..=MAX_HOURLY_LIMIT).contains(&limit) {
        return Err(format!(
            "Limite d'envoi invalide : entre 1 et {MAX_HOURLY_LIMIT} emails par heure."
        ));
    }
    with_lock(|| {
        let mut file = load(app)?;
        file.hourly_limit = Some(limit);
        save(app, &file)
    })
}

/// Refus avant l'envoi SMTP si le quota de l'heure est atteint.
pub fn ensure_can_send(app: &AppHandle) -> Result<(), String> {
    let now = EmailOAuthStore::now_unix();
    with_lock(|| {
        let file = load(app)?;
        let limit = effective_limit(&file);
        let wait = wait_seconds(&file.sent_at, limit, now);
        if wait == 0 {
            return Ok(());
        }
        let resume = chrono::Local::now() + chrono::Duration::seconds(wait);
        Err(format!(
            "{QUOTA_ERROR_MARK} ({limit} emails par heure, réglable dans Paramètres → Emails & envois → Connexion). \
             Prochain envoi possible vers {}.",
            resume.format("%H h %M")
        ))
    })
}

/// Envoi SMTP réussi : compté dans la fenêtre (les plus anciens sont purgés).
pub fn record_send(app: &AppHandle) -> Result<(), String> {
    let now = EmailOAuthStore::now_unix();
    with_lock(|| {
        let mut file = load(app)?;
        file.sent_at = recent_sends(&file.sent_at, now);
        file.sent_at.push(now);
        save(app, &file)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_800_000_000;

    #[test]
    fn under_limit_sends_immediately() {
        assert_eq!(wait_seconds(&[], 3, NOW), 0);
        assert_eq!(wait_seconds(&[NOW - 10, NOW - 5], 3, NOW), 0);
    }

    #[test]
    fn at_limit_waits_until_oldest_leaves_window() {
        let sent = [NOW - 3000, NOW - 100, NOW - 10];
        // Le plus ancien sort de la fenêtre dans 600 s (+1 de marge).
        assert_eq!(wait_seconds(&sent, 3, NOW), 601);
    }

    #[test]
    fn sends_older_than_an_hour_are_ignored() {
        let sent = [NOW - 7200, NOW - 3601, NOW - 10];
        assert_eq!(recent_sends(&sent, NOW), vec![NOW - 10]);
        assert_eq!(wait_seconds(&sent, 2, NOW), 0);
    }

    #[test]
    fn over_limit_uses_the_right_send_in_the_window() {
        // Limite abaissée à 2 alors que 4 envois sont dans la fenêtre : attendre que
        // le 3e plus récent (position len - limit) sorte.
        let sent = [NOW - 3500, NOW - 3000, NOW - 2000, NOW - 1000];
        assert_eq!(wait_seconds(&sent, 2, NOW), 2000 + 1 - 400);
    }

    #[test]
    fn invalid_or_missing_limit_falls_back_to_default() {
        let mut file = QuotaFile::default();
        assert_eq!(effective_limit(&file), DEFAULT_HOURLY_LIMIT);
        file.hourly_limit = Some(0);
        assert_eq!(effective_limit(&file), DEFAULT_HOURLY_LIMIT);
        file.hourly_limit = Some(80);
        assert_eq!(effective_limit(&file), 80);
    }

    #[test]
    fn batches_keep_ten_percent_for_single_sends() {
        assert_eq!(batch_limit(150), 135);
        assert_eq!(batch_limit(200), 180);
        assert_eq!(batch_limit(5), 5);
        assert_eq!(batch_limit(1), 1);
        let sent: Vec<i64> = (0..135).map(|i| NOW - 3000 + i).collect();
        assert!(wait_seconds(&sent, batch_limit(150), NOW) > 0, "lot en pause");
        assert_eq!(wait_seconds(&sent, 150, NOW), 0, "envoi unitaire encore possible");
    }

    #[test]
    fn far_future_timestamps_do_not_block_forever() {
        // Horloge du poste reculée : un horodatage « dans le futur » ne bloque pas.
        assert_eq!(wait_seconds(&[NOW + 86_400], 1, NOW), 0);
    }
}
