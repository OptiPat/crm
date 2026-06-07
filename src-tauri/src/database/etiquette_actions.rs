//! Actions automatiques rattachées à une étiquette.
//!
//! Aujourd'hui une seule action : « créer une tâche » quand l'étiquette est posée
//! automatiquement sur un contact. Stockée dans une table dédiée (`etiquette_actions`)
//! pour rester extensible sans alourdir le modèle `Etiquette`.

use super::models::EtiquetteAction;
use rusqlite::{params, OptionalExtension, Result};

/// Normalise la priorité de tâche vers l'une des trois valeurs autorisées.
fn normalize_priorite(value: Option<&str>) -> String {
    match value {
        Some("BASSE") => "BASSE".to_string(),
        Some("HAUTE") => "HAUTE".to_string(),
        _ => "NORMALE".to_string(),
    }
}

/// Remplace `{prenom}` / `{nom}` dans le modèle de titre, puis nettoie les espaces.
fn render_tache_titre(template: &str, prenom: &str, nom: &str) -> String {
    template
        .replace("{prenom}", prenom)
        .replace("{nom}", nom)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Échéance = jour d'éligibilité (minuit UTC) + N jours. N négatif est ramené à 0.
fn tache_echeance(eligible_at: i64, delai_jours: i64) -> i64 {
    let day = eligible_at - eligible_at.rem_euclid(86_400);
    day + delai_jours.max(0) * 86_400
}

impl super::Database {
    /// Lit l'action d'une étiquette (None si jamais configurée).
    pub fn get_etiquette_action(&self, etiquette_id: i64) -> Result<Option<EtiquetteAction>> {
        self.conn
            .query_row(
                "SELECT etiquette_id, tache_actif, tache_titre, tache_priorite, tache_delai_jours
                 FROM etiquette_actions WHERE etiquette_id = ?1",
                params![etiquette_id],
                |row| {
                    Ok(EtiquetteAction {
                        etiquette_id: row.get(0)?,
                        tache_actif: row.get::<_, i64>(1)? != 0,
                        tache_titre: row.get(2)?,
                        tache_priorite: row.get(3)?,
                        tache_delai_jours: row.get(4)?,
                    })
                },
            )
            .optional()
    }

    /// Crée ou met à jour l'action d'une étiquette (upsert).
    pub fn set_etiquette_action(&self, action: &EtiquetteAction) -> Result<()> {
        let priorite = normalize_priorite(action.tache_priorite.as_str().into());
        let titre = action
            .tache_titre
            .as_ref()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty());
        let actif = if action.tache_actif { 1 } else { 0 };
        let delai = action.tache_delai_jours.max(0);

        self.conn.execute(
            "INSERT INTO etiquette_actions
                (etiquette_id, tache_actif, tache_titre, tache_priorite, tache_delai_jours)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(etiquette_id) DO UPDATE SET
                tache_actif = excluded.tache_actif,
                tache_titre = excluded.tache_titre,
                tache_priorite = excluded.tache_priorite,
                tache_delai_jours = excluded.tache_delai_jours,
                updated_at = unixepoch()",
            params![action.etiquette_id, actif, titre, priorite, delai],
        )?;
        Ok(())
    }

    /// Déclenche l'action « tâche » d'une étiquette pour un contact, au plus une fois
    /// par liaison contact↔étiquette (déduplication via `contact_etiquettes.tache_id`).
    ///
    /// Appelé juste après une **nouvelle** attribution AUTO. Sans action active ou sans
    /// titre, ne fait rien. Idempotent : un second appel ne recrée pas de tâche.
    pub(crate) fn apply_etiquette_tache_action(
        &self,
        contact_id: i64,
        etiquette_id: i64,
        eligible_at: i64,
    ) -> Result<()> {
        let Some(action) = self.get_etiquette_action(etiquette_id)? else {
            return Ok(());
        };
        if !action.tache_actif {
            return Ok(());
        }
        let Some(template) = action.tache_titre.as_ref().map(|t| t.trim()).filter(|t| !t.is_empty())
        else {
            return Ok(());
        };

        // Liaison + garde de déduplication : si une tâche a déjà été créée, ne rien faire.
        let row = self
            .conn
            .query_row(
                "SELECT id, tache_id FROM contact_etiquettes
                 WHERE contact_id = ?1 AND etiquette_id = ?2",
                params![contact_id, etiquette_id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?)),
            )
            .optional()?;
        let Some((ce_id, existing_tache)) = row else {
            return Ok(());
        };
        if existing_tache.is_some() {
            return Ok(());
        }

        let contact = self.get_contact_by_id(contact_id)?;
        let titre = render_tache_titre(template, &contact.prenom, &contact.nom);
        if titre.is_empty() {
            return Ok(());
        }
        let priorite = normalize_priorite(action.tache_priorite.as_str().into());
        let echeance = tache_echeance(eligible_at, action.tache_delai_jours);

        self.conn.execute(
            "INSERT INTO taches (titre, date_echeance, priorite, statut)
             VALUES (?1, ?2, ?3, 'A_FAIRE')",
            params![titre, echeance, priorite],
        )?;
        let tache_id = self.conn.last_insert_rowid();

        // Lien tâche ↔ contact (source de vérité des contacts liés).
        self.conn.execute(
            "INSERT OR IGNORE INTO tache_contacts (tache_id, contact_id) VALUES (?1, ?2)",
            params![tache_id, contact_id],
        )?;

        self.conn.execute(
            "UPDATE contact_etiquettes SET tache_id = ?1 WHERE id = ?2",
            params![tache_id, ce_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{EtiquetteAction, NewContact};
    use crate::database::Database;

    fn mem_db() -> Database {
        Database::open_in_memory_for_tests().expect("db mémoire")
    }

    fn insert_etiquette(db: &Database, nom: &str) -> i64 {
        db.get_connection()
            .execute("INSERT INTO etiquettes (nom) VALUES (?1)", params![nom])
            .unwrap();
        db.get_connection().last_insert_rowid()
    }

    fn insert_contact(db: &Database, prenom: &str, nom: &str) -> i64 {
        db.create_contact(NewContact {
            famille_id: None,
            foyer_id: None,
            role_foyer: None,
            role_famille: None,
            categorie: "CLIENT".to_string(),
            filleul_categorie: None,
            parrain_id: None,
            prescripteur_id: None,
            civilite: None,
            nom: nom.to_string(),
            prenom: prenom.to_string(),
            email: None,
            telephone: None,
            adresse: None,
            code_postal: None,
            ville: None,
            date_naissance: None,
            profession: None,
            situation_familiale: None,
            source_lead: None,
            profil_risque_sri: None,
            date_dernier_contact: None,
            date_prochain_suivi: None,
            date_dernier_contact_filleul: None,
            date_prochain_suivi_filleul: None,
            statut_suivi: None,
            registre: None,
            notes: None,
            famille_regroupement_exclu: None,
        })
        .unwrap()
        .id
        .unwrap()
    }

    fn action(etiquette_id: i64, titre: &str, delai: i64) -> EtiquetteAction {
        EtiquetteAction {
            etiquette_id,
            tache_actif: true,
            tache_titre: Some(titre.to_string()),
            tache_priorite: "HAUTE".to_string(),
            tache_delai_jours: delai,
        }
    }

    #[test]
    fn set_and_get_roundtrip_normalizes_priorite() {
        let db = mem_db();
        let eid = insert_etiquette(&db, "Arbitrage");
        db.set_etiquette_action(&EtiquetteAction {
            etiquette_id: eid,
            tache_actif: true,
            tache_titre: Some("  Préparer   bilan  ".to_string()),
            tache_priorite: "FANTAISIE".to_string(),
            tache_delai_jours: -5,
        })
        .unwrap();

        let got = db.get_etiquette_action(eid).unwrap().unwrap();
        assert!(got.tache_actif);
        // `set` ne fait que trim ; le collapse des espaces internes a lieu au rendu du titre.
        assert_eq!(got.tache_titre.as_deref(), Some("Préparer   bilan"));
        assert_eq!(got.tache_priorite, "NORMALE");
        assert_eq!(got.tache_delai_jours, 0);
    }

    #[test]
    fn apply_creates_one_task_and_is_idempotent() {
        let db = mem_db();
        let eid = insert_etiquette(&db, "Relance");
        let cid = insert_contact(&db, "Marie", "Durand");
        db.set_etiquette_action(&action(eid, "Appeler {prenom} {nom}", 7))
            .unwrap();
        db.attribuer_etiquette(cid, eid, Some("AUTO".to_string()), None)
            .unwrap();

        db.apply_etiquette_tache_action(cid, eid, 1_700_000_000)
            .unwrap();
        db.apply_etiquette_tache_action(cid, eid, 1_700_000_000)
            .unwrap();

        let taches = db.get_taches_by_contact(cid).unwrap();
        assert_eq!(taches.len(), 1);
        assert_eq!(taches[0].titre, "Appeler Marie Durand");
        assert_eq!(taches[0].priorite, "HAUTE");
        assert_eq!(taches[0].statut, "A_FAIRE");
        assert_eq!(taches[0].date_echeance, Some(tache_echeance(1_700_000_000, 7)));
    }

    #[test]
    fn apply_does_nothing_when_inactive_or_no_action() {
        let db = mem_db();
        let eid = insert_etiquette(&db, "Sans action");
        let cid = insert_contact(&db, "Paul", "Martin");
        db.attribuer_etiquette(cid, eid, Some("AUTO".to_string()), None)
            .unwrap();

        // Pas d'action configurée
        db.apply_etiquette_tache_action(cid, eid, 1_700_000_000)
            .unwrap();
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 0);

        // Action présente mais désactivée
        db.set_etiquette_action(&EtiquetteAction {
            etiquette_id: eid,
            tache_actif: false,
            tache_titre: Some("Ne pas créer".to_string()),
            tache_priorite: "NORMALE".to_string(),
            tache_delai_jours: 0,
        })
        .unwrap();
        db.apply_etiquette_tache_action(cid, eid, 1_700_000_000)
            .unwrap();
        assert_eq!(db.get_taches_by_contact(cid).unwrap().len(), 0);
    }
}
