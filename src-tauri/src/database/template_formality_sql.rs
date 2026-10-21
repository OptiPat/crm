//! Fragments SQL : variante tutoiement liée + registre contact sur la file d'envoi.

/// JOINs supplémentaires après `templates_email t`.
pub const TEMPLATE_TU_RELANCE_JOINS: &str = "
                 LEFT JOIN templates_email t_tu ON t.tutoiement_template_id = t_tu.id
                 LEFT JOIN templates_email t_rel ON t.relance_template_id = t_rel.id
                 LEFT JOIN templates_email t_rel_tu ON t_rel.tutoiement_template_id = t_rel_tu.id";

fn pick_field(field: &str, envoi_alias: &str) -> String {
    format!(
        "CASE WHEN COALESCE({envoi_alias}.email_relance_active, 0) = 1 AND t_rel.id IS NOT NULL THEN
            CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_rel_tu.id IS NOT NULL
                 THEN COALESCE(t_rel_tu.{field}, '') ELSE COALESCE(t_rel.{field}, '') END
         ELSE
            CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
                 THEN COALESCE(t_tu.{field}, '') ELSE COALESCE(t.{field}, '') END
         END"
    )
}

fn pick_agenda_link_id(envoi_alias: &str) -> String {
    format!(
        "CASE WHEN COALESCE({envoi_alias}.email_relance_active, 0) = 1 AND t_rel.id IS NOT NULL THEN
            CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_rel_tu.id IS NOT NULL
                 THEN t_rel_tu.agenda_link_id ELSE t_rel.agenda_link_id END
         ELSE
            CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
                 THEN t_tu.agenda_link_id ELSE t.agenda_link_id END
         END"
    )
}

/// `variables` a au moins une pièce jointe.
fn has_attachments(vars: &str) -> String {
    format!(
        "(json_valid({vars}) AND json_type({vars}, '$.attachments') = 'array'
          AND json_array_length({vars}, '$.attachments') > 0)"
    )
}

/// Variante (tu, relance) sans pièce jointe : elle reprend celles du premier modèle de
/// `fallbacks` qui en a (un contact « tu » ne reçoit pas le mail sans le document joint).
/// Chaque pièce jointe garde son `template_id` d'origine : le fichier est retrouvé à l'envoi.
fn with_inherited_attachments(chosen: &str, fallbacks: &[&str]) -> String {
    let mut branches = String::new();
    for fb in fallbacks {
        branches.push_str(&format!(
            " WHEN {has} THEN json_set(CASE WHEN json_valid({chosen}) THEN {chosen} ELSE '{{}}' END,
                  '$.attachments', json(json_extract({fb}, '$.attachments')))",
            has = has_attachments(fb),
        ));
    }
    format!(
        "CASE WHEN {chosen_has} THEN {chosen}{branches} ELSE {chosen} END",
        chosen_has = has_attachments(chosen),
    )
}

fn pick_variables(envoi_alias: &str) -> String {
    format!(
        "CASE WHEN COALESCE({envoi_alias}.email_relance_active, 0) = 1 AND t_rel.id IS NOT NULL THEN
            CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_rel_tu.id IS NOT NULL
                 THEN {rel_tu} ELSE {rel} END
         ELSE
            CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
                 THEN {tu} ELSE t.variables END
         END",
        rel_tu = with_inherited_attachments("t_rel_tu.variables", &["t_rel.variables", "t.variables"]),
        rel = with_inherited_attachments("t_rel.variables", &["t.variables"]),
        tu = with_inherited_attachments("t_tu.variables", &["t.variables"]),
    )
}

fn pick_categorie(envoi_alias: &str) -> String {
    format!(
        "CASE WHEN COALESCE({envoi_alias}.email_relance_active, 0) = 1 AND t_rel.id IS NOT NULL THEN
            CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_rel_tu.id IS NOT NULL
                 THEN t_rel_tu.categorie ELSE t_rel.categorie END
         ELSE
            CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
                 THEN t_tu.categorie ELSE t.categorie END
         END"
    )
}

/// Champs template (sujet, corps, agenda, variables, categorie) — `ce` = contact_etiquettes.
pub fn template_queue_fields_sql() -> String {
    template_queue_fields_sql_for_alias("ce")
}

/// Même chose pour `contact_template_envois` (`cte`).
pub fn template_queue_fields_sql_cte() -> String {
    template_queue_fields_sql_for_alias("cte")
}

fn template_queue_fields_sql_for_alias(envoi_alias: &str) -> String {
    format!(
        "{sujet},
                        {corps},
                        {agenda},
                        {vars},
                        {cat}",
        sujet = pick_field("sujet", envoi_alias),
        corps = pick_field("corps", envoi_alias),
        agenda = pick_agenda_link_id(envoi_alias),
        vars = pick_variables(envoi_alias),
        cat = pick_categorie(envoi_alias),
    )
}

/// Variante tutoiement sans relance (planifiés, incomplets, etc.).
pub fn template_queue_fields_simple_sql() -> String {
    format!(
        "CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
              THEN COALESCE(t_tu.sujet, '') ELSE COALESCE(t.sujet, '') END,
         CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
              THEN COALESCE(t_tu.corps, '') ELSE COALESCE(t.corps, '') END,
         CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
              THEN t_tu.agenda_link_id ELSE t.agenda_link_id END,
         CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
              THEN {tu} ELSE t.variables END,
         CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
              THEN t_tu.categorie ELSE t.categorie END",
        tu = with_inherited_attachments("t_tu.variables", &["t.variables"]),
    )
}

#[cfg(test)]
mod tests {
    use super::with_inherited_attachments;
    use rusqlite::Connection;

    fn eval(chosen: Option<&str>, rel: Option<&str>, main: Option<&str>) -> Option<String> {
        let conn = Connection::open_in_memory().unwrap();
        let sql = format!(
            "SELECT {} FROM (SELECT ?1 AS variables) t_rel_tu, (SELECT ?2 AS variables) t_rel,
                            (SELECT ?3 AS variables) t",
            with_inherited_attachments("t_rel_tu.variables", &["t_rel.variables", "t.variables"])
        );
        conn.query_row(&sql, rusqlite::params![chosen, rel, main], |r| r.get(0))
            .unwrap()
    }

    const MAIN: &str = r#"{"corps_html":"<p>x</p>","attachments":[{"id":"a","template_id":1,"stored_name":"doc.pdf","filename":"doc.pdf","mime_type":"application/pdf","size_bytes":3}]}"#;

    #[test]
    fn variant_without_attachments_inherits_them() {
        let out: serde_json::Value =
            serde_json::from_str(&eval(Some(r#"{"corps_html":"<p>tu</p>"}"#), None, Some(MAIN)).unwrap())
                .unwrap();
        assert_eq!(out["corps_html"], "<p>tu</p>");
        assert_eq!(out["attachments"][0]["template_id"], 1);
        assert_eq!(out["attachments"][0]["stored_name"], "doc.pdf");
        // Variante sans aucune méta : idem.
        let out: serde_json::Value =
            serde_json::from_str(&eval(None, None, Some(MAIN)).unwrap()).unwrap();
        assert_eq!(out["attachments"][0]["stored_name"], "doc.pdf");
    }

    #[test]
    fn variant_with_own_attachments_keeps_them_and_nothing_to_inherit_stays_as_is() {
        let own = r#"{"attachments":[{"id":"b","template_id":2,"stored_name":"tu.pdf","filename":"tu.pdf","mime_type":"","size_bytes":1}]}"#;
        assert_eq!(eval(Some(own), None, Some(MAIN)).as_deref(), Some(own));
        assert_eq!(eval(Some("{}"), None, Some("{}")).as_deref(), Some("{}"));
        assert_eq!(eval(None, None, None), None);
        // Relance tu : d'abord les pièces jointes de la relance vous.
        let rel = r#"{"attachments":[{"id":"r","template_id":3,"stored_name":"rel.pdf","filename":"rel.pdf","mime_type":"","size_bytes":1}]}"#;
        let out: serde_json::Value =
            serde_json::from_str(&eval(Some("{}"), Some(rel), Some(MAIN)).unwrap()).unwrap();
        assert_eq!(out["attachments"][0]["stored_name"], "rel.pdf");
    }
}
