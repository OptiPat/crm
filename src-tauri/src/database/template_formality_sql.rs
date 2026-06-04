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

fn pick_variables(envoi_alias: &str) -> String {
    format!(
        "CASE WHEN COALESCE({envoi_alias}.email_relance_active, 0) = 1 AND t_rel.id IS NOT NULL THEN
            CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_rel_tu.id IS NOT NULL
                 THEN t_rel_tu.variables ELSE t_rel.variables END
         ELSE
            CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
                 THEN t_tu.variables ELSE t.variables END
         END"
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
    "CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
              THEN COALESCE(t_tu.sujet, '') ELSE COALESCE(t.sujet, '') END,
         CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
              THEN COALESCE(t_tu.corps, '') ELSE COALESCE(t.corps, '') END,
         CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
              THEN t_tu.agenda_link_id ELSE t.agenda_link_id END,
         CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
              THEN t_tu.variables ELSE t.variables END,
         CASE WHEN UPPER(COALESCE(c.registre, 'VOUS')) = 'TU' AND t_tu.id IS NOT NULL
              THEN t_tu.categorie ELSE t.categorie END".to_string()
}
