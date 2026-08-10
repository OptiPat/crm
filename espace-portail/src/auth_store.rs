use rusqlite::{params, OptionalExtension, Result};
use serde::Serialize;

use crate::client_auth::AuthMeResponse;

use crate::db::PortalDb;

pub struct LoginSuccess {
    pub contact_id: i64,
    pub email: String,
    pub token: String,
}

const MAX_LOGIN_FAILURES: i64 = 5;
const LOGIN_BLOCK_SECS: i64 = 15 * 60;
/// Délai minimum entre deux demandes de code pour un même contact.
const CODE_REQUEST_INTERVAL_SECS: i64 = 60;
/// Plafond horaire de codes envoyés, pour ne pas transformer le portail en
/// robot d'envoi vers la boîte d'un client.
const MAX_CODES_PER_HOUR: i64 = 6;
/// Message unique de refus de connexion : ne jamais laisser deviner si une
/// adresse possède un espace, ni si celui-ci a été révoqué.
const INVALID_CREDENTIALS: &str = "Identifiants incorrects";

/// Issue d'une demande de code. `Skip` ne doit jamais être exposé au client.
pub enum LoginCodeOutcome {
    Send { contact_id: i64, code: String },
    Skip(&'static str),
}

impl PortalDb {
    pub fn upsert_acces_from_sync(
        &self,
        contact_id: i64,
        statut: &str,
        email: Option<&str>,
        activation_code_hash: Option<&str>,
        premiere_connexion_at: Option<i64>,
    ) -> Result<()> {
        let email_norm = email.unwrap_or("").trim().to_lowercase();
        self.conn().execute(
            "INSERT INTO espace_acces (
                contact_id, statut, email, activation_code_hash,
                premiere_connexion_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())
             ON CONFLICT(contact_id) DO UPDATE SET
                statut = excluded.statut,
                email = CASE WHEN excluded.email != '' THEN excluded.email ELSE espace_acces.email END,
                -- Un nouveau code d'activation signifie une reactivation
                -- deliberee par le conseiller : la premiere connexion est a
                -- refaire, sinon le portail attendrait un code par email que
                -- le client ne peut pas obtenir.
                activation_code_hash = CASE
                    WHEN excluded.activation_code_hash IS NOT NULL THEN excluded.activation_code_hash
                    WHEN espace_acces.premiere_connexion_at IS NOT NULL THEN NULL
                    ELSE espace_acces.activation_code_hash
                END,
                premiere_connexion_at = CASE
                    WHEN excluded.activation_code_hash IS NOT NULL
                         AND excluded.activation_code_hash IS NOT espace_acces.activation_code_hash
                    THEN NULL
                    ELSE COALESCE(espace_acces.premiere_connexion_at, excluded.premiere_connexion_at)
                END,
                updated_at = unixepoch()",
            params![
                contact_id,
                statut,
                email_norm,
                activation_code_hash,
                premiere_connexion_at
            ],
        )?;
        if statut == "revoque" {
            self.conn().execute(
                "DELETE FROM espace_session WHERE contact_id = ?1",
                params![contact_id],
            )?;
            self.conn().execute(
                "DELETE FROM espace_login_code WHERE contact_id = ?1",
                params![contact_id],
            )?;
        }
        Ok(())
    }

    /// Prépare un code de connexion. Le code en clair n'est **jamais** stocké :
    /// seul son empreinte va en base, et le clair repart vers l'envoi immédiat.
    ///
    /// Les cas d'échec ne remontent qu'une raison interne, destinée aux logs :
    /// la réponse faite au client doit rester identique dans tous les cas, sans
    /// quoi le portail révèle quelles adresses possèdent un espace.
    pub fn prepare_login_code(
        &self,
        secret: &str,
        email: &str,
    ) -> Result<LoginCodeOutcome> {
        // Volontairement sans `is_login_blocked` : ce compteur est alimenté par
        // les échecs de connexion, qu'un tiers peut provoquer sans posséder la
        // boîte mail. L'y brancher permettrait d'empêcher un client de recevoir
        // son code en brûlant cinq tentatives à sa place.
        let Some(contact_id) = self.single_active_contact_for_email(email)? else {
            return Ok(LoginCodeOutcome::Skip(
                "aucun espace actif, ou adresse partagée par plusieurs contacts",
            ));
        };

        // Avant la première connexion, l'adresse email n'a encore rien prouvé :
        // envoyer un code reviendrait à contourner l'activation de vive voix.
        let premiere_connexion_at: Option<i64> = self
            .conn()
            .query_row(
                "SELECT premiere_connexion_at FROM espace_acces WHERE contact_id = ?1",
                params![contact_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        if premiere_connexion_at.is_none() {
            return Ok(LoginCodeOutcome::Skip(
                "premiere connexion non effectuee : code d'activation requis",
            ));
        }

        let now = chrono::Utc::now().timestamp();
        let last_code: Option<i64> = self
            .conn()
            .query_row(
                "SELECT created_at FROM espace_login_code
                 WHERE contact_id = ?1 ORDER BY id DESC LIMIT 1",
                params![contact_id],
                |row| row.get(0),
            )
            .optional()?;
        if last_code.is_some_and(|t| now - t < CODE_REQUEST_INTERVAL_SECS) {
            return Ok(LoginCodeOutcome::Skip("cadence de demande trop rapide"));
        }

        let codes_last_hour: i64 = self.conn().query_row(
            "SELECT COUNT(*) FROM espace_login_code
             WHERE contact_id = ?1 AND created_at >= ?2",
            params![contact_id, now - 3600],
            |row| row.get(0),
        )?;
        if codes_last_hour >= MAX_CODES_PER_HOUR {
            return Ok(LoginCodeOutcome::Skip("plafond horaire de codes atteint"));
        }

        let code = crate::login_code::generate_six_digit_code();
        let code_hash = crate::auth::hash_espace_otp(secret, &code);
        self.store_login_code(
            contact_id,
            &code_hash,
            now + crate::login_code::LOGIN_CODE_TTL_SECS,
        )?;

        Ok(LoginCodeOutcome::Send { contact_id, code })
    }

    /// Consomme le code d'activation remis de vive voix. Un seul essai gagnant :
    /// l'empreinte est effacée par la mise a jour de `premiere_connexion_at`.
    fn consume_activation_code(&self, contact_id: i64, code_hash: &str) -> Result<bool> {
        let stored: Option<String> = self
            .conn()
            .query_row(
                "SELECT activation_code_hash FROM espace_acces WHERE contact_id = ?1",
                params![contact_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        Ok(stored.is_some_and(|expected| expected == code_hash))
    }

    fn consume_login_code(&self, contact_id: i64, code_hash: &str) -> Result<bool> {
        let used = self.conn().execute(
            "UPDATE espace_login_code
             SET used_at = unixepoch()
             WHERE id = (
                SELECT id FROM espace_login_code
                WHERE contact_id = ?1
                  AND code_hash = ?2
                  AND used_at IS NULL
                  AND expires_at >= unixepoch()
                ORDER BY id DESC
                LIMIT 1
             )",
            params![contact_id, code_hash],
        )?;
        Ok(used > 0)
    }

    /// Résout une adresse vers **un seul** accès actif.
    ///
    /// Deux contacts peuvent partager une adresse — un couple, très fréquent
    /// dans ce métier. Choisir arbitrairement rattacherait la session au
    /// mauvais contact et servirait le patrimoine de l'autre : on refuse.
    fn single_active_contact_for_email(&self, email: &str) -> Result<Option<i64>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT contact_id FROM espace_acces
             WHERE lower(email) = lower(?1) AND statut = 'actif'
             LIMIT 2",
        )?;
        let ids = stmt
            .query_map(params![email], |row| row.get::<_, i64>(0))?
            .collect::<Result<Vec<_>>>()?;

        match ids.len() {
            1 => Ok(Some(ids[0])),
            0 => Ok(None),
            _ => {
                tracing::error!(
                    "Adresse partagée par {} accès actifs : connexion refusée. \
                     Donnez une adresse distincte à chaque membre du foyer.",
                    ids.len()
                );
                Ok(None)
            }
        }
    }

    pub fn store_login_code(
        &self,
        contact_id: i64,
        code_hash: &str,
        expires_at: i64,
    ) -> Result<()> {
        self.conn().execute(
            "INSERT INTO espace_login_code (contact_id, code_hash, expires_at)
             VALUES (?1, ?2, ?3)",
            params![contact_id, code_hash, expires_at],
        )?;
        Ok(())
    }

    pub fn try_login(
        &self,
        secret: &str,
        email: &str,
        code: &str,
        ip: Option<&str>,
        user_agent: Option<&str>,
    ) -> std::result::Result<LoginSuccess, String> {
        if self.is_login_blocked(email).map_err(|e| e.to_string())? {
            return Err("Trop de tentatives — réessayez dans quelques minutes".into());
        }

        // Message unique quelle que soit la cause : adresse inconnue, accès
        // révoqué, adresse partagée ou code faux. Distinguer les réponses
        // reviendrait à confirmer l'existence d'un espace.
        let Some(contact_id) = self
            .single_active_contact_for_email(email)
            .map_err(|e| e.to_string())?
        else {
            self.record_login_failure(email).map_err(|e| e.to_string())?;
            return Err(INVALID_CREDENTIALS.into());
        };

        let premiere_connexion_at: Option<i64> = self
            .conn()
            .query_row(
                "SELECT premiere_connexion_at FROM espace_acces WHERE contact_id = ?1",
                params![contact_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();

        let code_hash = crate::auth::hash_espace_otp(secret, code);
        let first_login = premiere_connexion_at.is_none();

        // Toute première connexion : seul le code d'activation, remis de vive
        // voix par le conseiller, est accepté. Les codes envoyés par email ne
        // prennent le relais qu'ensuite — sinon une adresse périmée suffirait
        // à ouvrir la vue patrimoniale d'un client.
        let accepted = if first_login {
            self.consume_activation_code(contact_id, &code_hash)
                .map_err(|e| e.to_string())?
        } else {
            self.consume_login_code(contact_id, &code_hash)
                .map_err(|e| e.to_string())?
        };

        if !accepted {
            self.record_login_failure(email).map_err(|e| e.to_string())?;
            let detail = if first_login {
                "code_activation_invalide"
            } else {
                "code_invalide"
            };
            self.log_connexion(contact_id, "login_failed", Some(detail), ip, user_agent)
                .ok();
            return Err(INVALID_CREDENTIALS.into());
        }

        if first_login {
            self.conn()
                .execute(
                    "UPDATE espace_acces
                     SET premiere_connexion_at = unixepoch(),
                         activation_code_hash = NULL,
                         updated_at = unixepoch()
                     WHERE contact_id = ?1",
                    params![contact_id],
                )
                .map_err(|e| e.to_string())?;
        }

        self.clear_login_failures(email).map_err(|e| e.to_string())?;
        let token = self.create_session(contact_id, secret)?;
        let event = if first_login {
            "first_login"
        } else {
            "login_success"
        };
        self.log_connexion(contact_id, event, None, ip, user_agent)
            .map_err(|e| e.to_string())?;

        Ok(LoginSuccess {
            contact_id,
            email: email.to_string(),
            token,
        })
    }

    /// Session valide si elle n'a pas dépassé sa durée absolue **et** si le
    /// client a été actif récemment. Chaque appel repousse l'inactivité.
    pub fn contact_id_for_session(&self, token: &str, secret: &str) -> Result<Option<i64>> {
        let token_hash = crate::auth::hash_espace_otp(secret, &format!("session:{token}"));
        let idle_floor = chrono::Utc::now().timestamp() - crate::client_auth::SESSION_IDLE_SECS;
        let contact_id: Option<i64> = self
            .conn()
            .query_row(
                "SELECT s.contact_id
                 FROM espace_session s
                 INNER JOIN espace_acces a ON a.contact_id = s.contact_id
                 WHERE s.token_hash = ?1
                   AND s.expires_at >= unixepoch()
                   AND s.last_seen_at >= ?2
                   AND a.statut = 'actif'",
                params![token_hash, idle_floor],
                |row| row.get(0),
            )
            .optional()?;

        if contact_id.is_some() {
            self.conn().execute(
                "UPDATE espace_session SET last_seen_at = unixepoch() WHERE token_hash = ?1",
                params![token_hash],
            )?;
        }
        Ok(contact_id)
    }

    /// Date de la preuve d'identité qui a ouvert la session — c'est-à-dire du
    /// code saisi. Sert à exiger une authentification récente sur les actions
    /// sensibles (**R7**), une session de trente jours ne prouvant plus rien.
    pub fn session_authenticated_at(&self, token: &str, secret: &str) -> Result<Option<i64>> {
        let token_hash = crate::auth::hash_espace_otp(secret, &format!("session:{token}"));
        self.conn()
            .query_row(
                "SELECT created_at FROM espace_session WHERE token_hash = ?1",
                params![token_hash],
                |row| row.get(0),
            )
            .optional()
    }

    /// Coupe toutes les sessions d'un contact (déconnexion à distance).
    pub fn revoke_all_sessions(&self, contact_id: i64) -> Result<usize> {
        self.conn().execute(
            "DELETE FROM espace_session WHERE contact_id = ?1",
            params![contact_id],
        )
    }

    pub fn revoke_session(&self, token: &str, secret: &str) -> Result<()> {
        let token_hash = crate::auth::hash_espace_otp(secret, &format!("session:{token}"));
        self.conn().execute(
            "DELETE FROM espace_session WHERE token_hash = ?1",
            params![token_hash],
        )?;
        Ok(())
    }

    pub fn auth_me(&self, contact_id: i64) -> Result<Option<AuthMeResponse>> {
        let row = self
            .get_contact_snapshot(contact_id)?
            .map(|snapshot| snapshot.payload);

        let Some(payload) = row else {
            return Ok(None);
        };

        let email = self
            .conn()
            .query_row(
                "SELECT email FROM espace_acces WHERE contact_id = ?1",
                params![contact_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        let Some(email) = email else {
            return Ok(None);
        };

        Ok(Some(AuthMeResponse {
            contact_id,
            email,
            prenom: payload["contact"]["prenom"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            nom: payload["contact"]["nom"]
                .as_str()
                .unwrap_or("")
                .to_string(),
        }))
    }

    pub fn list_connexion_log(
        &self,
        contact_id: i64,
        limit: i64,
    ) -> Result<Vec<ConnexionLogRow>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT id, contact_id, event, detail, ip, user_agent, created_at
             FROM espace_connexion_log
             WHERE contact_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(params![contact_id, limit], |row| {
                Ok(ConnexionLogRow {
                    id: row.get(0)?,
                    contact_id: row.get(1)?,
                    event: row.get(2)?,
                    detail: row.get(3)?,
                    ip: row.get(4)?,
                    user_agent: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    fn create_session(&self, contact_id: i64, secret: &str) -> std::result::Result<String, String> {
        let token: String = {
            use rand::Rng;
            (0..32)
                .map(|_| format!("{:02x}", rand::thread_rng().gen::<u8>()))
                .collect()
        };
        let token_hash = crate::auth::hash_espace_otp(secret, &format!("session:{token}"));
        let expires_at = chrono::Utc::now().timestamp() + crate::client_auth::SESSION_TTL_SECS;
        self.conn()
            .execute(
                "INSERT INTO espace_session (token_hash, contact_id, expires_at, last_seen_at)
                 VALUES (?1, ?2, ?3, unixepoch())",
                params![token_hash, contact_id, expires_at],
            )
            .map_err(|e| e.to_string())?;
        Ok(token)
    }

    fn log_connexion(
        &self,
        contact_id: i64,
        event: &str,
        detail: Option<&str>,
        ip: Option<&str>,
        user_agent: Option<&str>,
    ) -> Result<()> {
        self.conn().execute(
            "INSERT INTO espace_connexion_log (contact_id, event, detail, ip, user_agent)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![contact_id, event, detail, ip, user_agent],
        )?;
        Ok(())
    }

    fn is_login_blocked(&self, email: &str) -> Result<bool> {
        // `blocked_until` est NULL tant que le seuil d'echecs n'est pas atteint :
        // lire la colonne en `i64` echouait des la premiere tentative ratee.
        let blocked_until: Option<i64> = self
            .conn()
            .query_row(
                "SELECT blocked_until FROM espace_login_guard WHERE email = ?1",
                params![email],
                |row| row.get::<_, Option<i64>>(0),
            )
            .optional()?
            .flatten();
        Ok(blocked_until.is_some_and(|t| t > chrono::Utc::now().timestamp()))
    }

    fn record_login_failure(&self, email: &str) -> Result<()> {
        let failures: i64 = self
            .conn()
            .query_row(
                "SELECT failures FROM espace_login_guard WHERE email = ?1",
                params![email],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or(0)
            + 1;
        let blocked_until = if failures >= MAX_LOGIN_FAILURES {
            Some(chrono::Utc::now().timestamp() + LOGIN_BLOCK_SECS)
        } else {
            None
        };
        self.conn().execute(
            "INSERT INTO espace_login_guard (email, failures, blocked_until, updated_at)
             VALUES (?1, ?2, ?3, unixepoch())
             ON CONFLICT(email) DO UPDATE SET
                failures = excluded.failures,
                blocked_until = excluded.blocked_until,
                updated_at = unixepoch()",
            params![email, failures, blocked_until],
        )?;
        Ok(())
    }

    fn clear_login_failures(&self, email: &str) -> Result<()> {
        self.conn()
            .execute("DELETE FROM espace_login_guard WHERE email = ?1", params![email])?;
        Ok(())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnexionLogRow {
    pub id: i64,
    pub contact_id: i64,
    pub event: String,
    pub detail: Option<String>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: i64,
}

