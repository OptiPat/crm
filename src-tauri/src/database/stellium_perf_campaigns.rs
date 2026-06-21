//! Campagnes email performance AV/PER (relevé mensuel Stellium Contrats).

use super::birthdays::{is_contact_minor, type_produit_label};
use super::models::NewTemplateEmail;
use super::scpi_campaigns::contact_inherits_foyer_scpi_investments;
use super::Database;
use rusqlite::{params, OptionalExtension, Result};
use serde::{Deserialize, Serialize};

pub const STELLIUM_PERF_TEMPLATE_NOM: &str = "Performance AV/PER Stellium";
pub const STELLIUM_PERF_TEMPLATE_TU_NOM: &str = "Performance AV/PER Stellium (tu)";
pub const STELLIUM_PERF_DIGEST_VERSION: i64 = 9;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareStelliumPerfCampaignInput {
    pub periode: String,
    pub releve_date_unix: i64,
    pub investissement_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverStelliumPerfCampaignPrepareResponse {
    pub periode: String,
    pub releve_date_unix: i64,
    pub investissement_ids: Vec<i64>,
    pub contract_count: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareStelliumPerfCampaignResult {
    pub periode: String,
    pub batch_key: String,
    pub contacts_matched: u64,
    pub contacts_queued: u64,
    pub contacts_no_email: u64,
    pub contacts_proxy_to_parent: u64,
    pub contacts_skipped_already_sent: u64,
    pub message: String,
}

#[derive(Debug, Clone)]
struct ContractPerfLine {
    investissement_id: i64,
    type_produit: String,
    numero_contrat: Option<String>,
    encours_centimes: i64,
    nets_centimes: Option<i64>,
    perf_euro_centimes: Option<i64>,
    owner_prenom: Option<String>,
    partenaire_nom: Option<String>,
}

#[derive(Debug, Clone)]
struct BeneficiaryBundle {
    beneficiary_id: i64,
    beneficiary_prenom: String,
    #[allow(dead_code)]
    beneficiary_nom: String,
    beneficiary_email: Option<String>,
    beneficiary_date_naissance: Option<i64>,
    beneficiary_foyer_id: Option<i64>,
    seen_investissement_ids: std::collections::HashSet<i64>,
    contracts: Vec<ContractPerfLine>,
}

#[derive(Debug, Clone)]
struct RecipientBundle {
    recipient_id: i64,
    seen_investissement_ids: std::collections::HashSet<i64>,
    contracts: Vec<ContractPerfLine>,
    has_own_contracts: bool,
    proxy_child_prenoms: Vec<String>,
}

fn push_contract_to_bundle(
    bundle: &mut BeneficiaryBundle,
    investissement_id: i64,
    mut contract: ContractPerfLine,
) {
    if !bundle.seen_investissement_ids.insert(investissement_id) {
        return;
    }
    contract.investissement_id = investissement_id;
    contract.owner_prenom = None;
    bundle.contracts.push(contract);
}

fn push_contract_to_recipient(
    bundle: &mut RecipientBundle,
    investissement_id: i64,
    mut contract: ContractPerfLine,
    owner_prenom: Option<String>,
) {
    if !bundle.seen_investissement_ids.insert(investissement_id) {
        return;
    }
    contract.investissement_id = investissement_id;
    contract.owner_prenom = owner_prenom;
    bundle.contracts.push(contract);
}

fn normalize_batch_key(periode: &str) -> String {
    periode
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

const STELLIUM_TEMPLATE_VERSION: i64 = 6;

const DEFAULT_METRICS_PLAIN_VOUS: &str = "Valeur actuelle : {{encours}}\n\
Ce que vous avez versé (Net de frais) : {{nets}}\n\
Performance : {{perf_signed}} soit {{perf_pct}}";

const DEFAULT_METRICS_PLAIN_TU: &str = "Valeur actuelle : {{encours}}\n\
Ce que tu as versé (Net de frais) : {{nets}}\n\
Performance : {{perf_signed}} soit {{perf_pct}}";

const DEFAULT_METRICS_HTML_VOUS: &str = r#"<ul style="margin:0;padding:0 0 0 20px;list-style:disc"><li style="line-height:1.5;margin:0;padding:0"><strong>Valeur actuelle :</strong> {{encours}}</li><li style="line-height:1.5;margin:0;padding:0"><strong>Ce que vous avez versé (Net de frais) :</strong> {{nets}}</li><li style="line-height:1.5;margin:0;padding:0"><strong>Performance :</strong> {{perf_signed}} soit {{perf_pct}}</li></ul>"#;

const DEFAULT_METRICS_HTML_TU: &str = r#"<ul style="margin:0;padding:0 0 0 20px;list-style:disc"><li style="line-height:1.5;margin:0;padding:0"><strong>Valeur actuelle :</strong> {{encours}}</li><li style="line-height:1.5;margin:0;padding:0"><strong>Ce que tu as versé (Net de frais) :</strong> {{nets}}</li><li style="line-height:1.5;margin:0;padding:0"><strong>Performance :</strong> {{perf_signed}} soit {{perf_pct}}</li></ul>"#;

#[derive(Debug, Clone)]
struct StelliumLineFormats {
    plain_vous: String,
    plain_tu: String,
    html_vous: Option<String>,
    html_tu: Option<String>,
}

impl Default for StelliumLineFormats {
    fn default() -> Self {
        Self {
            plain_vous: DEFAULT_METRICS_PLAIN_VOUS.into(),
            plain_tu: DEFAULT_METRICS_PLAIN_TU.into(),
            html_vous: None,
            html_tu: None,
        }
    }
}

fn format_euros_integer_with_spaces(euros: i64) -> String {
    let s = euros.abs().to_string();
    let mut grouped = String::new();
    for (i, ch) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            grouped.push(' ');
        }
        grouped.push(ch);
    }
    grouped.chars().rev().collect()
}

fn format_euro_centimes(centimes: i64) -> String {
    let negative = centimes < 0;
    let abs = centimes.abs();
    let euros = abs / 100;
    let cents = abs % 100;
    let euros_str = format_euros_integer_with_spaces(euros);
    let amount = if cents == 0 {
        format!("{euros_str} €")
    } else {
        format!("{euros_str},{cents:02} €")
    };
    if negative {
        format!("-{amount}")
    } else {
        amount
    }
}

fn format_perf_signed_euro(centimes: i64) -> String {
    if centimes >= 0 {
        format!("+{}", format_euro_centimes(centimes))
    } else {
        format_euro_centimes(centimes)
    }
}

fn format_perf_pct_label(perf_centimes: i64, nets_centimes: i64) -> Option<String> {
    if nets_centimes <= 0 {
        return None;
    }
    let pct = (perf_centimes as f64 / nets_centimes as f64) * 100.0;
    let sign = if pct >= 0.0 { "+" } else { "" };
    Some(format!("{sign}{:.2} %", pct).replace('.', ","))
}

fn format_name_list_fr(names: &[String]) -> String {
    match names.len() {
        0 => String::new(),
        1 => names[0].clone(),
        2 => format!("{} et {}", names[0], names[1]),
        _ => {
            let last = names.last().cloned().unwrap_or_default();
            let rest = names[..names.len() - 1].join(", ");
            format!("{rest} et {last}")
        }
    }
}

fn stellium_releve_date_plain(unix: i64) -> Option<String> {
    use chrono::{Datelike, Local, TimeZone};
    let dt = Local.timestamp_opt(unix, 0).single()?;
    Some(format!(
        "{:02}/{:02}/{}",
        dt.day(),
        dt.month(),
        dt.year()
    ))
}

fn stellium_releve_date_suffix(unix: i64) -> Option<String> {
    stellium_releve_date_plain(unix).map(|d| format!("au {d}"))
}

fn perf_intro_phrases_for_recipient(
    releve_date_suffix: &str,
    contract_count: usize,
    has_own: bool,
    proxy_prenoms: &[String],
    single_product_label: Option<&str>,
) -> (String, String) {
    if !proxy_prenoms.is_empty() && !has_own {
        let names = format_name_list_fr(proxy_prenoms);
        let intro = format!(
            "Voici la performance des contrats de {names} {releve_date_suffix} :"
        );
        return (intro.clone(), intro);
    }
    if contract_count <= 1 {
        if let Some(product) = single_product_label.map(str::trim).filter(|s| !s.is_empty()) {
            return (
                format!("Voici la performance de ton contrat {product} {releve_date_suffix} :"),
                format!("Voici la performance de votre contrat {product} {releve_date_suffix} :"),
            );
        }
        return (
            format!("Voici la performance de ton contrat {releve_date_suffix} :"),
            format!("Voici la performance de votre contrat {releve_date_suffix} :"),
        );
    }
    (
        format!("Voici la performance de tes contrats {releve_date_suffix} :"),
        format!("Voici la performance de vos contrats {releve_date_suffix} :"),
    )
}

fn contract_product_label(c: &ContractPerfLine) -> String {
    let type_label = type_produit_label(&c.type_produit);
    if let Some(partenaire) = c
        .partenaire_nom
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        format!("{type_label} - {partenaire}")
    } else {
        type_label
    }
}

fn sort_recipient_contracts(contracts: &mut [ContractPerfLine]) {
    contracts.sort_by(|a, b| {
        let a_child = a.owner_prenom.is_some();
        let b_child = b.owner_prenom.is_some();
        match (a_child, b_child) {
            (false, true) => std::cmp::Ordering::Less,
            (true, false) => std::cmp::Ordering::Greater,
            _ => a.investissement_id.cmp(&b.investissement_id),
        }
    });
}

fn contrat_label_for_contract(
    c: &ContractPerfLine,
    recipient_prenom: &str,
    own_index: &mut usize,
    own_total: usize,
) -> String {
    if let Some(child_prenom) = c
        .owner_prenom
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return format!("Contrat {child_prenom}");
    }
    *own_index += 1;
    let prenom = recipient_prenom.trim();
    if own_total <= 1 {
        if prenom.is_empty() {
            "Contrat".to_string()
        } else {
            format!("Contrat {prenom}")
        }
    } else if prenom.is_empty() {
        format!("Contrat {own_index}")
    } else if *own_index == 1 {
        format!("Contrat {prenom}")
    } else {
        format!("Contrat {prenom} {own_index}")
    }
}

fn contrat_labels_for_recipient(
    contracts: &[ContractPerfLine],
    recipient_prenom: &str,
) -> Vec<String> {
    let own_total = contracts
        .iter()
        .filter(|c| c.owner_prenom.is_none())
        .count();
    let mut own_index = 0usize;
    contracts
        .iter()
        .map(|c| contrat_label_for_contract(c, recipient_prenom, &mut own_index, own_total))
        .collect()
}

fn contract_format_tokens(c: &ContractPerfLine, contrat_label: &str) -> [(&'static str, String); 9] {
    let produit = contract_product_label(c);
    let numero = c
        .numero_contrat
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    let encours = format_euro_centimes(c.encours_centimes);
    let nets = c
        .nets_centimes
        .map(format_euro_centimes)
        .unwrap_or_else(|| "—".to_string());
    let perf_signed = c
        .perf_euro_centimes
        .map(format_perf_signed_euro)
        .unwrap_or_else(|| "—".to_string());
    let perf_pct = match (c.perf_euro_centimes, c.nets_centimes) {
        (Some(perf), Some(nets)) => format_perf_pct_label(perf, nets).unwrap_or_else(|| "—".to_string()),
        _ => "—".to_string(),
    };
    [
        ("contrat_label", contrat_label.to_string()),
        ("produit", produit),
        ("numero", numero),
        ("encours", encours),
        ("nets", nets),
        ("perf_signed", perf_signed.clone()),
        ("perf_pct", perf_pct.clone()),
        (
            "perf_line",
            format!("Performance : {perf_signed} soit {perf_pct}"),
        ),
        ("owner_line", String::new()),
    ]
}

fn apply_line_format_template(template: &str, c: &ContractPerfLine, contrat_label: &str) -> String {
    let tokens = contract_format_tokens(c, contrat_label);
    let mut out = template.to_string();
    for (key, value) in tokens {
        out = out.replace(&format!("{{{{{key}}}}}"), &value);
    }
    out
}

fn apply_line_format_template_html(
    template: &str,
    c: &ContractPerfLine,
    contrat_label: &str,
) -> String {
    let tokens = contract_format_tokens(c, contrat_label);
    let mut out = template.to_string();
    for (key, value) in tokens {
        out = out.replace(&format!("{{{{{key}}}}}"), &escape_html_text(&value));
    }
    out
}

fn escape_html_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn show_contract_header(contracts: &[ContractPerfLine]) -> bool {
    contracts.len() > 1
}

fn build_contract_line_plain(
    c: &ContractPerfLine,
    contrat_label: &str,
    formats: &StelliumLineFormats,
    tu: bool,
    show_header: bool,
) -> String {
    let metrics_template = if tu {
        &formats.plain_tu
    } else {
        &formats.plain_vous
    };
    let metrics = apply_line_format_template(metrics_template, c, contrat_label);
    if show_header {
        format!(
            "{} : {}\n{}",
            contrat_label,
            contract_product_label(c),
            metrics
        )
    } else {
        metrics
    }
}

const PERF_CONTRACT_BLOCK_SPACER_HTML: &str =
    r#"<div style="line-height:1.5;margin:0;padding:0"><br></div>"#;

fn build_contract_line_html(
    c: &ContractPerfLine,
    contrat_label: &str,
    formats: &StelliumLineFormats,
    tu: bool,
    show_header: bool,
) -> String {
    let custom = if tu {
        formats.html_tu.as_deref()
    } else {
        formats.html_vous.as_deref()
    };
    if let Some(html_template) = custom {
        let inner = apply_line_format_template_html(html_template, c, contrat_label);
        return format!(
            "<div style=\"line-height:1.5;margin:0 0 12px 0;padding:0\">{inner}</div>"
        );
    }
    let metrics_template = if tu {
        DEFAULT_METRICS_HTML_TU
    } else {
        DEFAULT_METRICS_HTML_VOUS
    };
    let metrics = apply_line_format_template_html(metrics_template, c, contrat_label);
    if show_header {
        let header = format!(
            "<div style=\"line-height:1.5;margin:0 0 4px 0;font-weight:600\">{} : {}</div>",
            escape_html_text(contrat_label),
            escape_html_text(&contract_product_label(c))
        );
        format!(
            "<div style=\"margin:0 0 16px 0;padding:0\">{header}{metrics}</div>"
        )
    } else {
        format!("<div style=\"margin:0 0 16px 0;padding:0\">{metrics}</div>")
    }
}

struct PerfResumeBundle {
    plain_vous: String,
    plain_tu: String,
    html_vous: String,
    html_tu: String,
}

fn build_perf_resume(
    contracts: &[ContractPerfLine],
    recipient_prenom: &str,
    formats: &StelliumLineFormats,
) -> PerfResumeBundle {
    let labels = contrat_labels_for_recipient(contracts, recipient_prenom);
    let show_header = show_contract_header(contracts);
    let plain_vous = contracts
        .iter()
        .zip(labels.iter())
        .map(|(c, label)| build_contract_line_plain(c, label, formats, false, show_header))
        .collect::<Vec<_>>()
        .join("\n\n");
    let plain_tu = contracts
        .iter()
        .zip(labels.iter())
        .map(|(c, label)| build_contract_line_plain(c, label, formats, true, show_header))
        .collect::<Vec<_>>()
        .join("\n\n");
    let html_vous = contracts
        .iter()
        .zip(labels.iter())
        .map(|(c, label)| build_contract_line_html(c, label, formats, false, show_header))
        .collect::<Vec<_>>()
        .join(PERF_CONTRACT_BLOCK_SPACER_HTML);
    let html_tu = contracts
        .iter()
        .zip(labels.iter())
        .map(|(c, label)| build_contract_line_html(c, label, formats, true, show_header))
        .collect::<Vec<_>>()
        .join(PERF_CONTRACT_BLOCK_SPACER_HTML);
    PerfResumeBundle {
        plain_vous,
        plain_tu,
        html_vous,
        html_tu,
    }
}

fn contract_scalar_fields(c: &ContractPerfLine, contrat_label: &str) -> serde_json::Map<String, serde_json::Value> {
    let tokens = contract_format_tokens(c, contrat_label);
    let mut obj = serde_json::Map::new();
    for (key, value) in tokens {
        if matches!(
            key,
            "encours" | "nets" | "perf_signed" | "perf_pct" | "produit" | "numero" | "contrat_label"
        ) {
            obj.insert(key.to_string(), serde_json::Value::String(value));
        }
    }
    obj
}

const AUTRES_CONTRAT_BLOCK_VOUS: &str = r#"<div style="margin-top:12px;padding:0"><div style="line-height:1.5;margin:0 0 4px 0;font-weight:600">{{produit}}</div><ul style="margin:0;padding:0 0 0 20px;list-style:disc"><li style="line-height:1.5;margin:0;padding:0"><strong>Valeur actuelle :</strong> {{encours}}</li><li style="line-height:1.5;margin:0;padding:0"><strong>Ce que vous avez versé (Net de frais) :</strong> {{nets}}</li><li style="line-height:1.5;margin:0;padding:0"><strong>Performance :</strong> {{perf_signed}} soit {{perf_pct}}</li></ul></div>"#;

const AUTRES_CONTRAT_BLOCK_TU: &str = r#"<div style="margin-top:12px;padding:0"><div style="line-height:1.5;margin:0 0 4px 0;font-weight:600">{{produit}}</div><ul style="margin:0;padding:0 0 0 20px;list-style:disc"><li style="line-height:1.5;margin:0;padding:0"><strong>Valeur actuelle :</strong> {{encours}}</li><li style="line-height:1.5;margin:0;padding:0"><strong>Ce que tu as versé (Net de frais) :</strong> {{nets}}</li><li style="line-height:1.5;margin:0;padding:0"><strong>Performance :</strong> {{perf_signed}} soit {{perf_pct}}</li></ul></div>"#;

fn build_fixed_contracts_html(
    contracts: &[ContractPerfLine],
    labels: &[String],
    tu: bool,
) -> String {
    if contracts.is_empty() {
        return String::new();
    }
    let template = if tu {
        AUTRES_CONTRAT_BLOCK_TU
    } else {
        AUTRES_CONTRAT_BLOCK_VOUS
    };
    contracts
        .iter()
        .zip(labels.iter())
        .map(|(c, label)| apply_line_format_template_html(template, c, label))
        .collect::<String>()
}

fn build_recipient_campaign_variables_json(
    recipient: &RecipientBundle,
    recipient_prenom: &str,
    recipient_nom: &str,
    periode: &str,
    releve_date_unix: i64,
    prepared_at: i64,
) -> String {
    let mut contracts = recipient.contracts.clone();
    sort_recipient_contracts(&mut contracts);
    let count = contracts.len();
    let labels = contrat_labels_for_recipient(&contracts, recipient_prenom);
    let releve_date = stellium_releve_date_plain(releve_date_unix).unwrap_or_default();
    let releve_date_label =
        stellium_releve_date_suffix(releve_date_unix).unwrap_or_else(|| format!("({periode})"));
    let single_product_label = if count == 1 {
        contracts.first().map(contract_product_label)
    } else {
        None
    };
    let (intro_tu, intro_vous) = perf_intro_phrases_for_recipient(
        &releve_date_label,
        count,
        recipient.has_own_contracts,
        &recipient.proxy_child_prenoms,
        single_product_label.as_deref(),
    );
    let line_formats = StelliumLineFormats::default();
    let resume = build_perf_resume(&contracts, recipient_prenom, &line_formats);
    let is_proxy = !recipient.proxy_child_prenoms.is_empty();
    let mut vars = serde_json::Map::new();
    vars.insert("periode".into(), periode.trim().into());
    vars.insert("contrat_count".into(), serde_json::json!(count));
    vars.insert("releve_date".into(), releve_date.into());
    vars.insert("releve_date_label".into(), releve_date_label.into());
    vars.insert("perf_intro_tu".into(), intro_tu.into());
    vars.insert("perf_intro_vous".into(), intro_vous.into());
    vars.insert("perf_resume".into(), resume.plain_vous.clone().into());
    vars.insert("perf_resume_tu".into(), resume.plain_tu.clone().into());
    vars.insert("perf_resume_html".into(), resume.html_vous.clone().into());
    vars.insert("perf_resume_html_tu".into(), resume.html_tu.clone().into());
    vars.insert("perf_detail".into(), resume.plain_vous.clone().into());
    vars.insert("perf_detail_tu".into(), resume.plain_tu.clone().into());
    vars.insert("perf_detail_html".into(), resume.html_vous.clone().into());
    vars.insert("perf_detail_html_tu".into(), resume.html_tu.clone().into());
    vars.insert(
        "beneficiary_prenom".into(),
        recipient_prenom.trim().into(),
    );
    vars.insert("beneficiary_nom".into(), recipient_nom.trim().into());
    vars.insert("is_proxy_for_minor".into(), is_proxy.into());
    vars.insert("prepared_at".into(), prepared_at.into());
    vars.insert(
        "digest_version".into(),
        STELLIUM_PERF_DIGEST_VERSION.into(),
    );
    vars.insert(
        "perf_autres_contrats_html".into(),
        build_fixed_contracts_html(&contracts[1..], &labels[1..], false).into(),
    );
    vars.insert(
        "perf_autres_contrats_html_tu".into(),
        build_fixed_contracts_html(&contracts[1..], &labels[1..], true).into(),
    );
    if let Some(first) = contracts.first() {
        let first_label = labels.first().map(String::as_str).unwrap_or("Contrat");
        for (key, value) in contract_scalar_fields(first, first_label) {
            vars.insert(key, value);
        }
    } else {
        for key in [
            "encours",
            "nets",
            "perf_signed",
            "perf_pct",
            "produit",
            "numero",
            "contrat_label",
        ] {
            vars.insert(key.to_string(), String::new().into());
        }
    }
    serde_json::Value::Object(vars).to_string()
}

const STELLIUM_VOUS_CORPS_HTML: &str = r#"<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour {{prenom}} {{nom}},</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{perf_intro_vous}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{perf_detail_html}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">Bonne journée.</div></div>"#;

const STELLIUM_TU_CORPS_HTML: &str = r#"<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour {{prenom}},</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{perf_intro_tu}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">{{perf_detail_html_tu}}</div><div style="line-height:1.5;margin:0;padding:0"><br></div><div style="line-height:1.5;margin:0;padding:0">Bonne journée.</div></div>"#;

fn stellium_template_variables_json(corps_html: &str) -> String {
    serde_json::json!({
        "corps_html": corps_html,
        "stellium_perf_template_version": STELLIUM_TEMPLATE_VERSION,
        "email_suivi_reponse": { "attendre_reponse": false },
        "email_relance": { "enabled": false },
    })
    .to_string()
}

const STELLIUM_DEFAULT_SUJET: &str =
    "Performance AV/PER — {{periode}}, {{beneficiary_prenom}} {{beneficiary_nom}}";

fn stellium_template_user_customized(variables: Option<&str>) -> bool {
    let Some(raw) = variables.filter(|s| !s.trim().is_empty()) else {
        return false;
    };
    serde_json::from_str::<serde_json::Value>(raw)
        .ok()
        .and_then(|parsed| {
            parsed
                .get("stellium_perf_template_user_customized")
                .and_then(|v| v.as_bool())
        })
        .unwrap_or(false)
}

fn stellium_template_content_preserved(
    variables: Option<&str>,
    sujet: &str,
    corps: &str,
    tu: bool,
) -> bool {
    if stellium_template_user_customized(variables) {
        return true;
    }
    if sujet.trim() != STELLIUM_DEFAULT_SUJET {
        return true;
    }
    let default_corps = if tu {
        stellium_tu_corps_plain()
    } else {
        stellium_vous_corps_plain()
    };
    corps.trim() != default_corps.trim()
}

fn stellium_line_format_is_legacy(plain: &str) -> bool {
    let s = plain.trim();
    s.contains("Encours")
        || s.contains("Nets versés")
        || s.contains("contrat_label")
        || s.contains("Contrat {{")
        || s.contains("{{produit}}")
        || s.contains("{{perf_line}}")
        || s.contains("(net de frais)")
        || s.contains("vous avez")
}

fn fix_stellium_tu_corps_plain(corps: &str) -> String {
    let mut s = corps.to_string();
    s = s.replace("{{perf_detail_html_tu}}_tu", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_detail_tu}}_tu", "{{perf_detail_tu}}");
    s = s.replace("{{perf_detail_html}}_tu", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_detail}}_tu", "{{perf_detail_tu}}");
    s = s.replace("{{perf_resume_html}}_tu", "{{perf_resume_html_tu}}");
    s = s.replace("{{perf_resume}}_tu", "{{perf_resume_tu}}");
    s = s.replace("{{perf_resume_tu}}", "{{perf_detail_tu}}");
    s = s.replace("{{perf_resume}}", "{{perf_detail_tu}}");
    s = s.replace("{{perf_detail_html_tu}}", "{{PERF_DETAIL_HTML_TU}}");
    s = s.replace("{{perf_detail_html}}", "{{perf_detail_tu}}");
    s = s.replace("{{PERF_DETAIL_HTML_TU}}", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_detail_tu}}", "{{PERF_DETAIL_TU}}");
    s = s.replace("{{perf_detail}}", "{{perf_detail_tu}}");
    s = s.replace("{{PERF_DETAIL_TU}}", "{{perf_detail_tu}}");
    s
}

fn fix_stellium_vous_corps_plain(corps: &str) -> String {
    let mut s = corps.to_string();
    s = s.replace("{{perf_detail_html_tu}}", "{{PERF_DETAIL_SLOT}}");
    s = s.replace("{{perf_detail_tu}}", "{{perf_detail}}");
    s = s.replace("{{perf_detail_html}}_tu", "{{perf_detail}}");
    s = s.replace("{{perf_detail}}_tu", "{{perf_detail}}");
    s = s.replace("{{perf_resume_html_tu}}", "{{perf_detail_html}}");
    s = s.replace("{{perf_resume_html}}", "{{perf_detail_html}}");
    s = s.replace("{{perf_resume_tu}}", "{{perf_detail}}");
    s = s.replace("{{perf_resume}}", "{{perf_detail_html}}");
    s = s.replace("{{perf_intro_tu}}", "{{perf_intro_vous}}");
    s = s.replace("{{PERF_DETAIL_SLOT}}", "{{perf_detail}}");
    s
}

fn fix_stellium_tu_corps_html(corps_html: &str) -> String {
    let mut s = corps_html.to_string();
    s = s.replace("{{perf_detail_html_tu}}_tu", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_detail_tu}}_tu", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_detail_html}}_tu", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_detail}}_tu", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_detail_html_tu}}", "{{PERF_DETAIL_HTML_TU_SLOT}}");
    s = s.replace("{{perf_detail_html}}", "{{perf_detail_html_tu}}");
    s = s.replace("{{PERF_DETAIL_HTML_TU_SLOT}}", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_detail_tu}}", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_detail}}", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_resume_html_tu}}", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_resume_html}}", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_resume_tu}}", "{{perf_detail_html_tu}}");
    s = s.replace("{{perf_resume}}", "{{perf_detail_html_tu}}");
    s
}

fn fix_stellium_vous_corps_html(corps_html: &str) -> String {
    let mut s = corps_html.to_string();
    s = s.replace("{{perf_detail_html_tu}}", "{{PERF_DETAIL_HTML_VOUS_SLOT}}");
    s = s.replace("{{perf_detail_tu}}", "{{perf_detail}}");
    s = s.replace("{{perf_detail_html}}", "{{perf_detail_html}}");
    s = s.replace("{{perf_detail}}", "{{perf_detail_html}}");
    s = s.replace("{{PERF_DETAIL_HTML_VOUS_SLOT}}", "{{perf_detail_html}}");
    s = s.replace("{{perf_resume_html_tu}}", "{{perf_detail_html}}");
    s = s.replace("{{perf_resume_html}}", "{{perf_detail_html}}");
    s = s.replace("{{perf_resume_tu}}", "{{perf_detail}}");
    s = s.replace("{{perf_resume}}", "{{perf_detail_html}}");
    s = s.replace("{{perf_intro_tu}}", "{{perf_intro_vous}}");
    s
}

fn merge_stellium_template_variables(
    existing: Option<&str>,
    corps_html: &str,
    tu: bool,
) -> String {
    let mut parsed = existing
        .filter(|s| !s.trim().is_empty())
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let obj = parsed
        .as_object_mut()
        .expect("stellium template variables object");
    let stored_html = obj
        .get("corps_html")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let merged_html = if tu {
        fix_stellium_tu_corps_html(stored_html.unwrap_or(corps_html))
    } else {
        fix_stellium_vous_corps_html(stored_html.unwrap_or(corps_html))
    };
    obj.insert("corps_html".into(), merged_html.into());
    if obj
        .get("stellium_perf_line_plain_vous")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_none()
        || obj
            .get("stellium_perf_line_plain_vous")
            .and_then(|v| v.as_str())
            .map(|s| stellium_line_format_is_legacy(s))
            .unwrap_or(false)
    {
        obj.insert(
            "stellium_perf_line_plain_vous".into(),
            DEFAULT_METRICS_PLAIN_VOUS.into(),
        );
    }
    if obj
        .get("stellium_perf_line_plain_tu")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_none()
        || obj
            .get("stellium_perf_line_plain_tu")
            .and_then(|v| v.as_str())
            .map(|s| stellium_line_format_is_legacy(s))
            .unwrap_or(false)
    {
        obj.insert(
            "stellium_perf_line_plain_tu".into(),
            DEFAULT_METRICS_PLAIN_TU.into(),
        );
    }
    if obj
        .get("stellium_perf_line_html_vous")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some()
    {
        obj.remove("stellium_perf_line_html_vous");
    }
    if obj
        .get("stellium_perf_line_html_tu")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some()
    {
        obj.remove("stellium_perf_line_html_tu");
    }
    if !obj.contains_key("stellium_perf_template_version") {
        obj.insert(
            "stellium_perf_template_version".into(),
            STELLIUM_TEMPLATE_VERSION.into(),
        );
    }
    if !obj.contains_key("email_suivi_reponse") {
        obj.insert(
            "email_suivi_reponse".into(),
            serde_json::json!({ "attendre_reponse": false }),
        );
    }
    if !obj.contains_key("email_relance") {
        obj.insert(
            "email_relance".into(),
            serde_json::json!({ "enabled": false }),
        );
    }
    parsed.to_string()
}

fn stellium_template_needs_upgrade(variables: Option<&str>) -> bool {
    let Some(raw) = variables.filter(|s| !s.trim().is_empty()) else {
        return true;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(raw) else {
        return true;
    };
    if parsed
        .get("stellium_perf_template_user_customized")
        .and_then(|v| v.as_bool())
        == Some(true)
    {
        return false;
    }
    let corps_html = parsed.get("corps_html").and_then(|v| v.as_str());
    if corps_html.map(str::trim).filter(|s| !s.is_empty()).is_none() {
        return true;
    }
    parsed
        .get("stellium_perf_template_version")
        .and_then(|v| v.as_i64())
        .unwrap_or(0)
        < STELLIUM_TEMPLATE_VERSION
}

fn stellium_vous_corps_plain() -> &'static str {
    "Bonjour {{prenom}} {{nom}},\n\n\
{{perf_intro_vous}}\n\n\
{{perf_detail}}\n\n\
Bonne journée."
}

fn stellium_tu_corps_plain() -> &'static str {
    "Bonjour {{prenom}},\n\n\
{{perf_intro_tu}}\n\n\
{{perf_detail_tu}}\n\n\
Bonne journée."
}

fn contact_has_email(email: Option<&str>) -> bool {
    email.map(str::trim).filter(|s| !s.is_empty()).is_some()
}

fn stellium_periode_label(unix: i64) -> Option<String> {
    use chrono::{Datelike, Local, TimeZone};
    let dt = Local.timestamp_opt(unix, 0).single()?;
    const MOIS: [&str; 12] = [
        "Janvier",
        "Février",
        "Mars",
        "Avril",
        "Mai",
        "Juin",
        "Juillet",
        "Août",
        "Septembre",
        "Octobre",
        "Novembre",
        "Décembre",
    ];
    Some(format!(
        "{} {}",
        MOIS[(dt.month() as usize).saturating_sub(1)],
        dt.year()
    ))
}

impl Database {
    pub fn ensure_stellium_perf_email_templates(&self) -> Result<()> {
        let exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM templates_email WHERE nom = ?1",
            params![STELLIUM_PERF_TEMPLATE_NOM],
            |row| row.get(0),
        )?;
        if exists > 0 {
            return self.upgrade_stellium_perf_email_templates();
        }

        let tu = self.create_template_email(NewTemplateEmail {
            nom: STELLIUM_PERF_TEMPLATE_TU_NOM.into(),
            sujet: "Performance AV/PER — {{periode}}, {{beneficiary_prenom}} {{beneficiary_nom}}".into(),
            corps: stellium_tu_corps_plain().into(),
            categorie: "NEWSLETTER".into(),
            variables: Some(stellium_template_variables_json(STELLIUM_TU_CORPS_HTML)),
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: None,
        })?;

        let _vous = self.create_template_email(NewTemplateEmail {
            nom: STELLIUM_PERF_TEMPLATE_NOM.into(),
            sujet: "Performance AV/PER — {{periode}}, {{beneficiary_prenom}} {{beneficiary_nom}}".into(),
            corps: stellium_vous_corps_plain().into(),
            categorie: "NEWSLETTER".into(),
            variables: Some(stellium_template_variables_json(STELLIUM_VOUS_CORPS_HTML)),
            agenda_link_id: None,
            relance_template_id: None,
            tutoiement_template_id: Some(tu.id),
        })?;

        Ok(())
    }

    fn upgrade_stellium_perf_email_templates(&self) -> Result<()> {
        let tu_row: Option<(i64, String, String, Option<String>)> = self
            .conn
            .query_row(
                "SELECT id, sujet, corps, variables FROM templates_email WHERE nom = ?1",
                params![STELLIUM_PERF_TEMPLATE_TU_NOM],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .ok();
        let vous_row: Option<(i64, String, String, Option<String>, Option<i64>)> = self
            .conn
            .query_row(
                "SELECT id, sujet, corps, variables, tutoiement_template_id FROM templates_email WHERE nom = ?1",
                params![STELLIUM_PERF_TEMPLATE_NOM],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .ok();

        let Some((vous_id, vous_sujet, vous_corps, vous_vars, tu_link)) = vous_row else {
            return Ok(());
        };

        let tu_preserved = tu_row
            .as_ref()
            .map(|(_, tu_sujet, tu_corps, tu_vars)| {
                stellium_template_content_preserved(tu_vars.as_deref(), tu_sujet, tu_corps, true)
            })
            .unwrap_or(false);
        let vous_preserved =
            stellium_template_content_preserved(vous_vars.as_deref(), &vous_sujet, &vous_corps, false);
        let any_preserved = tu_preserved || vous_preserved;

        let tu_id = if let Some((id, _tu_sujet, tu_corps, tu_vars)) = tu_row {
            if any_preserved {
                let merged = merge_stellium_template_variables(
                    tu_vars.as_deref(),
                    STELLIUM_TU_CORPS_HTML,
                    true,
                );
                let fixed_corps = fix_stellium_tu_corps_plain(&tu_corps);
                self.conn.execute(
                    "UPDATE templates_email SET variables = ?1, corps = ?2, updated_at = unixepoch() WHERE id = ?3",
                    params![merged, fixed_corps, id],
                )?;
            } else if stellium_template_needs_upgrade(tu_vars.as_deref()) {
                self.conn.execute(
                    "UPDATE templates_email SET sujet = ?1, corps = ?2, variables = ?3, updated_at = unixepoch()
                     WHERE id = ?4",
                    params![
                        STELLIUM_DEFAULT_SUJET,
                        stellium_tu_corps_plain(),
                        stellium_template_variables_json(STELLIUM_TU_CORPS_HTML),
                        id
                    ],
                )?;
            }
            Some(id)
        } else {
            let tu = self.create_template_email(NewTemplateEmail {
                nom: STELLIUM_PERF_TEMPLATE_TU_NOM.into(),
                sujet: STELLIUM_DEFAULT_SUJET.into(),
                corps: stellium_tu_corps_plain().into(),
                categorie: "NEWSLETTER".into(),
                variables: Some(stellium_template_variables_json(STELLIUM_TU_CORPS_HTML)),
                agenda_link_id: None,
                relance_template_id: None,
                tutoiement_template_id: None,
            })?;
            Some(tu.id)
        };

        if any_preserved {
            let merged = merge_stellium_template_variables(
                vous_vars.as_deref(),
                STELLIUM_VOUS_CORPS_HTML,
                false,
            );
            let fixed_corps = fix_stellium_vous_corps_plain(&vous_corps);
            self.conn.execute(
                "UPDATE templates_email SET variables = ?1, corps = ?2, updated_at = unixepoch() WHERE id = ?3",
                params![merged, fixed_corps, vous_id],
            )?;
        } else if stellium_template_needs_upgrade(vous_vars.as_deref()) {
            self.conn.execute(
                "UPDATE templates_email SET sujet = ?1, corps = ?2, variables = ?3,
                    tutoiement_template_id = ?4, updated_at = unixepoch()
                 WHERE id = ?5",
                params![
                    STELLIUM_DEFAULT_SUJET,
                    stellium_vous_corps_plain(),
                    stellium_template_variables_json(STELLIUM_VOUS_CORPS_HTML),
                    tu_id,
                    vous_id
                ],
            )?;
        } else if tu_link.is_none() {
            if let Some(tu_id) = tu_id {
                self.conn.execute(
                    "UPDATE templates_email SET tutoiement_template_id = ?1, updated_at = unixepoch()
                     WHERE id = ?2",
                    params![tu_id, vous_id],
                )?;
            }
        }

        self.reconcile_stellium_tutoiement_link(vous_id)?;
        if let Some(tu_id) = self.stellium_tu_template_id()? {
            self.apply_stellium_tu_template_fixes(tu_id)?;
        }
        self.apply_stellium_vous_template_fixes(vous_id)?;
        Ok(())
    }

    fn stellium_tu_template_id(&self) -> Result<Option<i64>> {
        self.conn
            .query_row(
                "SELECT id FROM templates_email WHERE nom = ?1",
                params![STELLIUM_PERF_TEMPLATE_TU_NOM],
                |row| row.get(0),
            )
            .optional()
    }

    fn reconcile_stellium_tutoiement_link(&self, vous_id: i64) -> Result<()> {
        let Some(tu_id) = self.stellium_tu_template_id()? else {
            return Ok(());
        };
        let current: Option<i64> = self
            .conn
            .query_row(
                "SELECT tutoiement_template_id FROM templates_email WHERE id = ?1",
                params![vous_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        if current != Some(tu_id) {
            self.conn.execute(
                "UPDATE templates_email SET tutoiement_template_id = ?1, updated_at = unixepoch()
                 WHERE id = ?2",
                params![tu_id, vous_id],
            )?;
        }
        Ok(())
    }

    fn apply_stellium_tu_template_fixes(&self, tu_id: i64) -> Result<()> {
        let (corps, vars): (String, Option<String>) = self.conn.query_row(
            "SELECT corps, variables FROM templates_email WHERE id = ?1",
            params![tu_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let fixed_corps = fix_stellium_tu_corps_plain(&corps);
        let merged = merge_stellium_template_variables(
            vars.as_deref(),
            STELLIUM_TU_CORPS_HTML,
            true,
        );
        self.conn.execute(
            "UPDATE templates_email SET corps = ?1, variables = ?2, updated_at = unixepoch() WHERE id = ?3",
            params![fixed_corps, merged, tu_id],
        )?;
        Ok(())
    }

    fn apply_stellium_vous_template_fixes(&self, vous_id: i64) -> Result<()> {
        let (corps, vars): (String, Option<String>) = self.conn.query_row(
            "SELECT corps, variables FROM templates_email WHERE id = ?1",
            params![vous_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let fixed_corps = fix_stellium_vous_corps_plain(&corps);
        let merged = merge_stellium_template_variables(
            vars.as_deref(),
            STELLIUM_VOUS_CORPS_HTML,
            false,
        );
        self.conn.execute(
            "UPDATE templates_email SET corps = ?1, variables = ?2, updated_at = unixepoch() WHERE id = ?3",
            params![fixed_corps, merged, vous_id],
        )?;
        Ok(())
    }

    fn get_stellium_perf_template_id(&self) -> Result<i64> {
        self.ensure_stellium_perf_email_templates()?;
        self.conn.query_row(
            "SELECT id FROM templates_email WHERE nom = ?1",
            params![STELLIUM_PERF_TEMPLATE_NOM],
            |row| row.get(0),
        )
    }

    fn load_stellium_contract_line(
        &self,
        investissement_id: i64,
        releve_date_unix: i64,
    ) -> Result<Option<ContractPerfLine>> {
        self.conn
            .query_row(
                "SELECT i.type_produit, i.numero_contrat,
                        v.montant, v.stellium_versements_nets_centimes, v.stellium_perf_euro_centimes,
                        p.raison_sociale
                 FROM investissements i
                 INNER JOIN investissement_valorisations v ON v.investissement_id = i.id
                 LEFT JOIN partenaires p ON p.id = i.partenaire_id
                 WHERE i.id = ?1
                   AND (v.stellium_versements_nets_centimes IS NOT NULL OR v.stellium_perf_euro_centimes IS NOT NULL)
                   AND ABS(v.date_valorisation - ?2) <= 86400
                 ORDER BY v.date_valorisation DESC, v.id DESC
                 LIMIT 1",
                params![investissement_id, releve_date_unix],
                |row| {
                    Ok(ContractPerfLine {
                        investissement_id,
                        type_produit: row.get(0)?,
                        numero_contrat: row.get(1)?,
                        encours_centimes: row.get(2)?,
                        nets_centimes: row.get(3)?,
                        perf_euro_centimes: row.get(4)?,
                        owner_prenom: None,
                        partenaire_nom: row.get(5)?,
                    })
                },
            )
            .optional()
    }

    fn load_beneficiary_contact(
        &self,
        contact_id: i64,
    ) -> Result<(String, String, Option<String>, Option<i64>, Option<i64>)> {
        self.conn.query_row(
            "SELECT prenom, nom, email, date_naissance, foyer_id FROM contacts WHERE id = ?1",
            params![contact_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
    }

    fn load_investissement_owner(
        &self,
        investissement_id: i64,
    ) -> Result<(Option<i64>, Option<i64>)> {
        self.conn.query_row(
            "SELECT contact_id, foyer_id FROM investissements WHERE id = ?1",
            params![investissement_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
    }

    fn load_foyer_inheriting_contact_ids(&self, foyer_id: i64) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, role_foyer FROM contacts
             WHERE foyer_id = ?1 AND categorie IN ('CLIENT', 'PROSPECT_CLIENT')",
        )?;
        let rows: Vec<(i64, Option<String>)> = stmt
            .query_map(params![foyer_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows
            .into_iter()
            .filter(|(_, role)| contact_inherits_foyer_scpi_investments(role.as_deref()))
            .map(|(id, _)| id)
            .collect())
    }

    fn new_beneficiary_bundle(&self, beneficiary_id: i64) -> BeneficiaryBundle {
        let (prenom, nom, email, date_naissance, foyer_id) = self
            .load_beneficiary_contact(beneficiary_id)
            .unwrap_or_else(|_| {
                (
                    "Client".into(),
                    "CRM".into(),
                    None,
                    None,
                    None,
                )
            });
        BeneficiaryBundle {
            beneficiary_id,
            beneficiary_prenom: prenom,
            beneficiary_nom: nom,
            beneficiary_email: email,
            beneficiary_date_naissance: date_naissance,
            beneficiary_foyer_id: foyer_id,
            seen_investissement_ids: std::collections::HashSet::new(),
            contracts: Vec::new(),
        }
    }

    fn load_foyer_parents_with_email(&self, foyer_id: i64) -> Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM contacts
             WHERE foyer_id = ?1
               AND role_foyer IN ('DECLARANT_1', 'DECLARANT_2')
               AND email IS NOT NULL AND TRIM(email) != ''",
        )?;
        let rows = stmt
            .query_map(params![foyer_id], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn resolve_recipient_contact_ids(
        &self,
        bundle: &BeneficiaryBundle,
        releve_date_unix: i64,
    ) -> Result<Vec<(i64, bool)>> {
        if contact_has_email(bundle.beneficiary_email.as_deref()) {
            return Ok(vec![(bundle.beneficiary_id, false)]);
        }
        let minor = is_contact_minor(bundle.beneficiary_date_naissance, releve_date_unix);
        if !minor {
            return Ok(vec![(bundle.beneficiary_id, false)]);
        }
        let Some(foyer_id) = bundle.beneficiary_foyer_id else {
            return Ok(vec![(bundle.beneficiary_id, false)]);
        };
        let parents = self.load_foyer_parents_with_email(foyer_id)?;
        if parents.is_empty() {
            return Ok(vec![(bundle.beneficiary_id, false)]);
        }
        Ok(parents.into_iter().map(|id| (id, true)).collect())
    }

    fn upsert_stellium_perf_envoi(
        &self,
        contact_id: i64,
        template_id: i64,
        batch_base: &str,
        batch_key: &str,
        campaign_variables: &str,
        email_date_prevue: Option<i64>,
        now: i64,
    ) -> Result<&'static str> {
        let existing: Option<(i64, i64, String)> = self
            .conn
            .query_row(
                "SELECT id, email_envoye, COALESCE(campaign_batch_key, '')
                 FROM contact_template_envois
                 WHERE contact_id = ?1 AND template_id = ?2 AND investissement_id IS NULL
                   AND (
                     COALESCE(campaign_batch_key, '') = ?3
                     OR COALESCE(campaign_batch_key, '') LIKE ?4 || '-%'
                   )
                 ORDER BY email_envoye DESC, id DESC
                 LIMIT 1",
                params![contact_id, template_id, batch_key, batch_base],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();

        if let Some((id, sent, existing_key)) = existing {
            if sent != 0 {
                return Ok("already_sent");
            }
            self.conn.execute(
                "UPDATE contact_template_envois SET
                    campaign_batch_key = ?1,
                    campaign_variables = ?2,
                    trigger_event_at = ?3,
                    email_date_prevue = ?4,
                    email_annule = 0,
                    email_suivi_ignore = 0
                 WHERE id = ?5",
                params![
                    batch_key,
                    campaign_variables,
                    now,
                    email_date_prevue,
                    id
                ],
            )?;
            let _ = existing_key;
            return Ok("updated");
        }

        self.conn.execute(
            "INSERT INTO contact_template_envois (
                contact_id, template_id, investissement_id, trigger_event_at,
                email_date_prevue, campaign_batch_key, campaign_variables
             ) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6)",
            params![
                contact_id,
                template_id,
                now,
                email_date_prevue,
                batch_key,
                campaign_variables
            ],
        )?;
        Ok("created")
    }

    fn clear_superseded_stellium_perf_envois(
        &self,
        recipient_id: i64,
        template_id: i64,
        batch_base: &str,
        keep_batch_key: &str,
    ) -> Result<()> {
        self.conn.execute(
            "DELETE FROM contact_template_envois
             WHERE contact_id = ?1 AND template_id = ?2 AND investissement_id IS NULL
               AND email_envoye = 0
               AND COALESCE(campaign_batch_key, '') LIKE ?3 || '-%'
               AND COALESCE(campaign_batch_key, '') != ?4",
            params![recipient_id, template_id, batch_base, keep_batch_key],
        )?;
        Ok(())
    }

    /// Dernier relevé Stellium en base (tous contrats partageant cette date de valorisation).
    pub fn discover_stellium_perf_campaign_prepare_input(
        &self,
    ) -> Result<Option<DiscoverStelliumPerfCampaignPrepareResponse>> {
        let releve_date: Option<i64> = self.conn.query_row(
            "SELECT MAX(date_valorisation) FROM investissement_valorisations
             WHERE stellium_versements_nets_centimes IS NOT NULL
                OR stellium_perf_euro_centimes IS NOT NULL",
            [],
            |row| row.get(0),
        )?;
        let Some(releve_date) = releve_date else {
            return Ok(None);
        };
        let Some(periode) = stellium_periode_label(releve_date) else {
            return Ok(None);
        };

        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT investissement_id FROM investissement_valorisations
             WHERE (stellium_versements_nets_centimes IS NOT NULL
                    OR stellium_perf_euro_centimes IS NOT NULL)
               AND ABS(date_valorisation - ?1) <= 86400
             ORDER BY investissement_id",
        )?;
        let investissement_ids: Vec<i64> = stmt
            .query_map(params![releve_date], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        if investissement_ids.is_empty() {
            return Ok(None);
        }

        Ok(Some(DiscoverStelliumPerfCampaignPrepareResponse {
            periode,
            releve_date_unix: releve_date,
            contract_count: investissement_ids.len() as u64,
            investissement_ids,
        }))
    }

    pub fn prepare_stellium_perf_campaign(
        &self,
        input: PrepareStelliumPerfCampaignInput,
    ) -> Result<PrepareStelliumPerfCampaignResult> {
        let periode = input.periode.trim();
        if periode.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "periode obligatoire".into(),
            ));
        }
        if input.investissement_ids.is_empty() {
            return Err(rusqlite::Error::InvalidParameterName(
                "investissement_ids vide".into(),
            ));
        }

        let template_id = self.get_stellium_perf_template_id()?;
        let batch_base = normalize_batch_key(periode);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let mut bundles: std::collections::HashMap<i64, BeneficiaryBundle> =
            std::collections::HashMap::new();

        for investissement_id in &input.investissement_ids {
            let (contact_id, foyer_id) = self.load_investissement_owner(*investissement_id)?;
            let contract = match self
                .load_stellium_contract_line(*investissement_id, input.releve_date_unix)?
            {
                Some(c) => c,
                None => continue,
            };

            if let Some(beneficiary_id) = contact_id {
                let entry = bundles
                    .entry(beneficiary_id)
                    .or_insert_with(|| self.new_beneficiary_bundle(beneficiary_id));
                push_contract_to_bundle(entry, *investissement_id, contract);
            } else if let Some(fid) = foyer_id {
                let inheritors = self.load_foyer_inheriting_contact_ids(fid)?;
                for beneficiary_id in inheritors {
                    let entry = bundles
                        .entry(beneficiary_id)
                        .or_insert_with(|| self.new_beneficiary_bundle(beneficiary_id));
                    push_contract_to_bundle(entry, *investissement_id, contract.clone());
                }
            }
        }

        let mut contacts_matched = 0u64;
        let mut contacts_queued = 0u64;
        let mut contacts_no_email = 0u64;
        let mut contacts_proxy_to_parent = 0u64;
        let mut contacts_skipped_already_sent = 0u64;

        let mut recipient_bundles: std::collections::HashMap<i64, RecipientBundle> =
            std::collections::HashMap::new();

        for bundle in bundles.values() {
            if bundle.contracts.is_empty() {
                continue;
            }
            contacts_matched += 1;
            let recipients =
                self.resolve_recipient_contact_ids(bundle, input.releve_date_unix)?;
            for (recipient_id, is_proxy) in recipients {
                let entry = recipient_bundles
                    .entry(recipient_id)
                    .or_insert_with(|| RecipientBundle {
                        recipient_id,
                        seen_investissement_ids: std::collections::HashSet::new(),
                        contracts: Vec::new(),
                        has_own_contracts: false,
                        proxy_child_prenoms: Vec::new(),
                    });
                if is_proxy {
                    let prenom = bundle.beneficiary_prenom.trim();
                    if !prenom.is_empty()
                        && !entry
                            .proxy_child_prenoms
                            .iter()
                            .any(|existing| existing == prenom)
                    {
                        entry.proxy_child_prenoms.push(prenom.to_string());
                    }
                } else if recipient_id == bundle.beneficiary_id {
                    entry.has_own_contracts = true;
                }
                for contract in &bundle.contracts {
                    let owner = if is_proxy {
                        Some(bundle.beneficiary_prenom.clone())
                    } else {
                        None
                    };
                    push_contract_to_recipient(
                        entry,
                        contract.investissement_id,
                        contract.clone(),
                        owner,
                    );
                }
            }
        }

        for recipient in recipient_bundles.values() {
            if recipient.contracts.is_empty() {
                continue;
            }
            let batch_key = format!("{}-r{}", batch_base, recipient.recipient_id);
            let (recipient_prenom, recipient_nom, email, _, _) = self
                .load_beneficiary_contact(recipient.recipient_id)
                .unwrap_or_else(|_| ("".into(), "".into(), None, None, None));
            let campaign_variables = build_recipient_campaign_variables_json(
                recipient,
                &recipient_prenom,
                &recipient_nom,
                periode,
                input.releve_date_unix,
                now,
            );
            let has_email = contact_has_email(email.as_deref());
            if !has_email {
                contacts_no_email += 1;
            } else if !recipient.proxy_child_prenoms.is_empty() {
                contacts_proxy_to_parent += 1;
            }

            self.clear_superseded_stellium_perf_envois(
                recipient.recipient_id,
                template_id,
                &batch_base,
                &batch_key,
            )?;

            let email_date_prevue = Some(now);
            match self.upsert_stellium_perf_envoi(
                recipient.recipient_id,
                template_id,
                &batch_base,
                &batch_key,
                &campaign_variables,
                email_date_prevue,
                now,
            )? {
                "already_sent" => contacts_skipped_already_sent += 1,
                "created" | "updated" => {
                    if has_email {
                        contacts_queued += 1;
                    }
                }
                _ => {}
            }
        }

        let message = format!(
            "Campagne perf {} : {} bénéficiaire(s), {} prêt(s) à envoyer, {} via parent(s), {} sans email, {} déjà envoyé(s).",
            periode,
            contacts_matched,
            contacts_queued,
            contacts_proxy_to_parent,
            contacts_no_email,
            contacts_skipped_already_sent
        );

        let snapshot = super::stellium_perf_dashboard::StelliumPerfLastPrepareSnapshot {
            periode: periode.to_string(),
            batch_key: batch_base.clone(),
            prepared_at: now,
            contract_count: input.investissement_ids.len() as u64,
            contacts_matched,
            contacts_queued,
            contacts_no_email,
            contacts_proxy_to_parent,
            contacts_skipped_already_sent,
            digest_version: STELLIUM_PERF_DIGEST_VERSION,
        };
        self.save_stellium_last_prepare_snapshot(&snapshot)?;

        Ok(PrepareStelliumPerfCampaignResult {
            periode: periode.to_string(),
            batch_key: batch_base,
            contacts_matched,
            contacts_queued,
            contacts_no_email,
            contacts_proxy_to_parent,
            contacts_skipped_already_sent,
            message,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{NewContact, NewFoyer, NewInvestissement, NewInvestissementValorisation};

    fn sample_client(nom: &str, prenom: &str) -> NewContact {
        NewContact {
            categorie: "CLIENT".into(),
            nom: nom.into(),
            prenom: prenom.into(),
            statut_suivi: Some("ACTIF".into()),
            famille_id: None,
            foyer_id: None,
            role_foyer: None,
            role_famille: None,
            filleul_categorie: None,
            parrain_id: None,
            prescripteur_id: None,
            civilite: None,
            email: None,
            telephone: None,
            adresse: None,
            code_postal: None,
            ville: None,
            pays: None,
            date_naissance: None,
            lieu_naissance: None,
            profession: None,
            situation_familiale: None,
            regime_matrimonial: None,
            revenus_annuels: None,
            charges_emprunts: None,
            epargne_precaution_souhaitee: None,
            objectifs_patrimoniaux: None,
            source_lead: None,
            profil_risque_sri: None,
            date_dernier_contact: None,
            date_prochain_suivi: None,
            date_dernier_contact_filleul: None,
            date_prochain_suivi_filleul: None,
            notes: None,
            registre: None,
            famille_regroupement_exclu: None,
        }
    }

    fn seed_stellium_investment(
        db: &Database,
        contact_id: i64,
        nom: &str,
        num: &str,
        perf_centimes: i64,
    ) -> (i64, i64) {
        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(contact_id),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: nom.into(),
                numero_contrat: Some(num.into()),
                montant_initial: Some(1_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: Some(false),
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: Some(false),
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap()
            .id;
        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv,
            montant: 1_050_000,
            date_valorisation: Some("2026-06-19T00:00:00.000Z".into()),
            notes: Some("Import Stellium contrats".into()),
            stellium_versements_nets_centimes: Some(1_000_000),
            stellium_perf_euro_centimes: Some(perf_centimes),
        })
        .unwrap();
        let releve: i64 = db
            .conn
            .query_row(
                "SELECT date_valorisation FROM investissement_valorisations WHERE investissement_id = ?1",
                params![inv],
                |row| row.get(0),
            )
            .unwrap();
        (inv, releve)
    }

    fn seed_stellium_foyer_investment(
        db: &Database,
        foyer_id: i64,
        nom: &str,
        num: &str,
        perf_centimes: i64,
    ) -> (i64, i64) {
        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: None,
                foyer_id: Some(foyer_id),
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: nom.into(),
                numero_contrat: Some(num.into()),
                montant_initial: Some(1_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: Some(false),
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: Some(false),
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap()
            .id;
        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv,
            montant: 1_050_000,
            date_valorisation: Some("2026-06-19T00:00:00.000Z".into()),
            notes: Some("Import Stellium contrats".into()),
            stellium_versements_nets_centimes: Some(1_000_000),
            stellium_perf_euro_centimes: Some(perf_centimes),
        })
        .unwrap();
        let releve: i64 = db
            .conn
            .query_row(
                "SELECT date_valorisation FROM investissement_valorisations WHERE investissement_id = ?1",
                params![inv],
                |row| row.get(0),
            )
            .unwrap();
        (inv, releve)
    }

    #[test]
    fn prepare_campaign_routes_foyer_common_to_declarants() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.ensure_stellium_perf_email_templates().unwrap();

        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer MARTIN".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let decl1 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                email: Some("decl1@example.com".into()),
                ..sample_client("MARTIN", "Paul")
            })
            .unwrap()
            .id
            .unwrap();

        let decl2 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_2".into()),
                email: Some("decl2@example.com".into()),
                ..sample_client("MARTIN", "Sophie")
            })
            .unwrap()
            .id
            .unwrap();

        let (inv, releve) =
            seed_stellium_foyer_investment(&db, foyer.id, "AV Commun", "999", 75_000);

        let result = db
            .prepare_stellium_perf_campaign(PrepareStelliumPerfCampaignInput {
                periode: "Juin 2026".into(),
                releve_date_unix: releve,
                investissement_ids: vec![inv],
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 2);
        assert_eq!(result.contacts_queued, 2);

        for contact_id in [decl1, decl2] {
            let vars: String = db
                .conn
                .query_row(
                    "SELECT campaign_variables FROM contact_template_envois WHERE contact_id = ?1",
                    params![contact_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(vars.contains("assurance-vie"));
            assert!(vars.contains("\"is_proxy_for_minor\":false"));
        }
    }

    #[test]
    fn prepare_campaign_excludes_enfant_from_foyer_common() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.ensure_stellium_perf_email_templates().unwrap();

        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer LEROY".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let parent = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                email: Some("parent@example.com".into()),
                ..sample_client("LEROY", "Marie")
            })
            .unwrap()
            .id
            .unwrap();

        let enfant = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("ENFANT".into()),
                email: Some("enfant@example.com".into()),
                date_naissance: Some("2015-06-01T00:00:00.000Z".into()),
                ..sample_client("LEROY", "Lucas")
            })
            .unwrap()
            .id
            .unwrap();

        let (inv, releve) =
            seed_stellium_foyer_investment(&db, foyer.id, "AV Commun", "888", 40_000);

        let result = db
            .prepare_stellium_perf_campaign(PrepareStelliumPerfCampaignInput {
                periode: "Juin 2026".into(),
                releve_date_unix: releve,
                investissement_ids: vec![inv],
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 1);
        assert_eq!(result.contacts_queued, 1);

        let parent_envoi: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![parent],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(parent_envoi, 1);

        let enfant_envoi: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![enfant],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(enfant_envoi, 0);
    }

    #[test]
    fn prepare_campaign_merges_personal_and_foyer_common_for_declarant() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.ensure_stellium_perf_email_templates().unwrap();

        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer BERNARD".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let decl1 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                email: Some("bernard@example.com".into()),
                ..sample_client("BERNARD", "Luc")
            })
            .unwrap()
            .id
            .unwrap();

        let (inv_perso, releve) =
            seed_stellium_investment(&db, decl1, "AV Perso", "111", 10_000);
        let (inv_commun, _) =
            seed_stellium_foyer_investment(&db, foyer.id, "AV Commun", "222", 20_000);

        let result = db
            .prepare_stellium_perf_campaign(PrepareStelliumPerfCampaignInput {
                periode: "Juin 2026".into(),
                releve_date_unix: releve,
                investissement_ids: vec![inv_perso, inv_commun],
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 1);
        assert_eq!(result.contacts_queued, 1);

        let vars: String = db
            .conn
            .query_row(
                "SELECT campaign_variables FROM contact_template_envois WHERE contact_id = ?1",
                params![decl1],
                |row| row.get(0),
            )
            .unwrap();
        assert!(vars.contains("assurance-vie"));
        assert!(vars.contains("\"contrat_count\":2"));

        let envoi_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![decl1],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(envoi_count, 1);
    }

    #[test]
    fn build_perf_resume_aggregates_multiple_contracts() {
        let contracts = vec![
            ContractPerfLine {
                investissement_id: 1,
                type_produit: "ASSURANCE_VIE".into(),
                numero_contrat: Some("123".into()),
                encours_centimes: 100_000,
                nets_centimes: Some(90_000),
                perf_euro_centimes: Some(10_000),
                owner_prenom: None,
                partenaire_nom: None,
            },
            ContractPerfLine {
                investissement_id: 2,
                type_produit: "PER".into(),
                numero_contrat: Some("456".into()),
                encours_centimes: 50_000,
                nets_centimes: Some(48_000),
                perf_euro_centimes: Some(2_000),
                owner_prenom: None,
                partenaire_nom: None,
            },
        ];
        let (resume, _) = {
            let formats = StelliumLineFormats::default();
            let r = build_perf_resume(&contracts, "Marie", &formats);
            (r.plain_vous, r.html_vous)
        };
        assert!(resume.contains("Contrat Marie"));
        assert!(resume.contains("Contrat Marie 2"));
        assert!(resume.contains("Valeur actuelle"));
        assert!(resume.contains("1 000 €"));
        assert!(resume.contains("Performance : +100 €"));
        assert_eq!(resume.matches("Valeur actuelle").count(), 2);
    }

    #[test]
    fn prepare_campaign_groups_multi_contract_and_routes_minor_to_parent() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.ensure_stellium_perf_email_templates().unwrap();

        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer DUPONT".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let parent = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                email: Some("parent@example.com".into()),
                ..sample_client("DUPONT", "Marie")
            })
            .unwrap()
            .id
            .unwrap();

        let enfant = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("ENFANT".into()),
                email: None,
                date_naissance: Some("2015-06-01T00:00:00.000Z".into()),
                ..sample_client("DUPONT", "Lucas")
            })
            .unwrap()
            .id
            .unwrap();

        let mut inv_ids = Vec::new();
        let mut releve = 0_i64;
        for (nom, num) in [("AV 1", "111"), ("AV 2", "222")] {
            let (inv, r) = seed_stellium_investment(&db, enfant, nom, num, 50_000);
            releve = r;
            inv_ids.push(inv);
        }

        let result = db
            .prepare_stellium_perf_campaign(PrepareStelliumPerfCampaignInput {
                periode: "Juin 2026".into(),
                releve_date_unix: releve,
                investissement_ids: inv_ids,
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 1);
        assert_eq!(result.contacts_queued, 1);
        assert_eq!(result.contacts_proxy_to_parent, 1);

        let vars: String = db
            .conn
            .query_row(
                "SELECT campaign_variables FROM contact_template_envois WHERE contact_id = ?1",
                params![parent],
                |row| row.get(0),
            )
            .unwrap();
        assert!(vars.contains("assurance-vie"));
        assert!(vars.contains("\"is_proxy_for_minor\":true"));
        assert!(vars.contains("Lucas"));
        assert!(!vars.contains("{{beneficiary_prenom}}"));

        let envoi_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![parent],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(envoi_count, 1);
    }

    #[test]
    fn prepare_campaign_aggregates_parent_own_and_children_into_one_envoi() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.ensure_stellium_perf_email_templates().unwrap();

        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer AMANDINE".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let parent = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                email: Some("amandine@example.com".into()),
                ..sample_client("DUPONT", "Amandine")
            })
            .unwrap()
            .id
            .unwrap();

        let enfant1 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("ENFANT".into()),
                email: None,
                date_naissance: Some("2015-06-01T00:00:00.000Z".into()),
                ..sample_client("DUPONT", "Lucas")
            })
            .unwrap()
            .id
            .unwrap();

        let enfant2 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("ENFANT".into()),
                email: None,
                date_naissance: Some("2017-03-01T00:00:00.000Z".into()),
                ..sample_client("DUPONT", "Emma")
            })
            .unwrap()
            .id
            .unwrap();

        let (inv_parent, releve) =
            seed_stellium_investment(&db, parent, "AV Amandine", "100", 10_000);
        let (inv_enfant1, _) = seed_stellium_investment(&db, enfant1, "AV Lucas", "111", 20_000);
        let (inv_enfant2, _) = seed_stellium_investment(&db, enfant2, "AV Emma", "222", 30_000);

        let result = db
            .prepare_stellium_perf_campaign(PrepareStelliumPerfCampaignInput {
                periode: "Juin 2026".into(),
                releve_date_unix: releve,
                investissement_ids: vec![inv_parent, inv_enfant1, inv_enfant2],
            })
            .unwrap();

        assert_eq!(result.contacts_queued, 1);

        let envoi_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![parent],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(envoi_count, 1);

        let vars: String = db
            .conn
            .query_row(
                "SELECT campaign_variables FROM contact_template_envois WHERE contact_id = ?1",
                params![parent],
                |row| row.get(0),
            )
            .unwrap();
        assert!(vars.contains("assurance-vie"));
        assert!(vars.contains("\"contrat_count\":3"));
        assert!(vars.contains("vos contrats"));
        assert!(vars.contains("Contrat Amandine"));
        assert!(vars.contains("Contrat Lucas"));
        assert!(vars.contains("Contrat Emma"));
        assert!(!vars.contains("Contrat enfant 1"));
        assert!(vars.contains("\"beneficiary_prenom\":\"Amandine\""));
        assert!(vars.contains("\"beneficiary_nom\":\"DUPONT\""));
        assert!(!vars.contains("{{beneficiary_prenom}}"));
        assert!(!vars.contains("{{periode}}"));
    }

    #[test]
    fn prepare_campaign_respects_already_sent_legacy_batch_key() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.ensure_stellium_perf_email_templates().unwrap();

        let client = db
            .create_contact(NewContact {
                email: Some("legacy@example.com".into()),
                ..sample_client("MARTIN", "Jean")
            })
            .unwrap()
            .id
            .unwrap();

        let (inv, releve) = seed_stellium_investment(&db, client, "AV Legacy", "555", 15_000);
        let input = PrepareStelliumPerfCampaignInput {
            periode: "Juin 2026".into(),
            releve_date_unix: releve,
            investissement_ids: vec![inv],
        };
        db.prepare_stellium_perf_campaign(input.clone()).unwrap();

        let template_id: i64 = db
            .conn
            .query_row(
                "SELECT id FROM templates_email WHERE nom = ?1",
                params![STELLIUM_PERF_TEMPLATE_NOM],
                |row| row.get(0),
            )
            .unwrap();

        db.conn
            .execute(
                "UPDATE contact_template_envois
                 SET campaign_batch_key = ?1, email_envoye = 1
                 WHERE contact_id = ?2 AND template_id = ?3",
                params![format!("juin2026-b{}", client), client, template_id],
            )
            .unwrap();

        let result = db.prepare_stellium_perf_campaign(input).unwrap();
        assert_eq!(result.contacts_skipped_already_sent, 1);
        assert_eq!(result.contacts_queued, 0);

        let envoi_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![client],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(envoi_count, 1);
    }

    #[test]
    fn prepare_campaign_routes_minor_to_both_parents_with_email() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.ensure_stellium_perf_email_templates().unwrap();

        let foyer = db
            .create_foyer(NewFoyer {
                nom: "Foyer MARTIN".into(),
                type_foyer: "COUPLE".into(),
                nombre_parts_fiscales: None,
                tranche_imposition: None,
                revenu_fiscal_reference: None,
                ir_net_a_payer: None,
                situation_patrimoniale: None,
                objectifs_patrimoniaux: None,
                notes: None,
            })
            .unwrap();

        let parent1 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_1".into()),
                email: Some("p1@example.com".into()),
                ..sample_client("MARTIN", "Paul")
            })
            .unwrap()
            .id
            .unwrap();
        let parent2 = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("DECLARANT_2".into()),
                email: Some("p2@example.com".into()),
                ..sample_client("MARTIN", "Anne")
            })
            .unwrap()
            .id
            .unwrap();

        let enfant = db
            .create_contact(NewContact {
                foyer_id: Some(foyer.id),
                role_foyer: Some("ENFANT".into()),
                email: None,
                date_naissance: Some("2015-06-01T00:00:00.000Z".into()),
                ..sample_client("MARTIN", "Leo")
            })
            .unwrap()
            .id
            .unwrap();

        let (inv, releve) = seed_stellium_investment(&db, enfant, "PER Enfant", "333", 25_000);
        let result = db
            .prepare_stellium_perf_campaign(PrepareStelliumPerfCampaignInput {
                periode: "Juin 2026".into(),
                releve_date_unix: releve,
                investissement_ids: vec![inv],
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 1);
        assert_eq!(result.contacts_queued, 2);
        assert_eq!(result.contacts_proxy_to_parent, 2);

        for parent_id in [parent1, parent2] {
            let envoi_count: i64 = db
                .conn
                .query_row(
                    "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                    params![parent_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(envoi_count, 1);

            let vars: String = db
                .conn
                .query_row(
                    "SELECT campaign_variables FROM contact_template_envois WHERE contact_id = ?1",
                    params![parent_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(vars.contains("assurance-vie"));
            assert!(vars.contains("Leo"));
            assert!(!vars.contains("{{beneficiary_prenom}}"));
        }
    }

    #[test]
    fn prepare_campaign_counts_adult_without_email() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.ensure_stellium_perf_email_templates().unwrap();

        let adult = db
            .create_contact(NewContact {
                email: None,
                date_naissance: Some("1980-01-01T00:00:00.000Z".into()),
                ..sample_client("BERNARD", "Luc")
            })
            .unwrap()
            .id
            .unwrap();

        let (inv, releve) = seed_stellium_investment(&db, adult, "AV Solo", "444", 10_000);
        let result = db
            .prepare_stellium_perf_campaign(PrepareStelliumPerfCampaignInput {
                periode: "Juin 2026".into(),
                releve_date_unix: releve,
                investissement_ids: vec![inv],
            })
            .unwrap();

        assert_eq!(result.contacts_matched, 1);
        assert_eq!(result.contacts_queued, 0);
        assert_eq!(result.contacts_no_email, 1);
        assert_eq!(result.contacts_proxy_to_parent, 0);

        let envoi_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![adult],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(envoi_count, 1);
    }

    #[test]
    fn prepare_campaign_reprepare_updates_variables() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.ensure_stellium_perf_email_templates().unwrap();

        let client = db
            .create_contact(NewContact {
                email: Some("client@example.com".into()),
                ..sample_client("LEGRAND", "Paul")
            })
            .unwrap()
            .id
            .unwrap();

        let (inv, releve) = seed_stellium_investment(&db, client, "Evoluvie", "555", 50_000);
        let input = PrepareStelliumPerfCampaignInput {
            periode: "Juin 2026".into(),
            releve_date_unix: releve,
            investissement_ids: vec![inv],
        };
        db.prepare_stellium_perf_campaign(input.clone()).unwrap();

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv,
            montant: 1_120_000,
            date_valorisation: Some("2026-06-19T00:00:00.000Z".into()),
            notes: Some("Import Stellium contrats".into()),
            stellium_versements_nets_centimes: Some(1_000_000),
            stellium_perf_euro_centimes: Some(120_000),
        })
        .unwrap();

        db.prepare_stellium_perf_campaign(input).unwrap();

        let vars: String = db
            .conn
            .query_row(
                "SELECT campaign_variables FROM contact_template_envois WHERE contact_id = ?1",
                params![client],
                |row| row.get(0),
            )
            .unwrap();
        assert!(vars.contains("\"encours\""));
        assert!(vars.contains("11 200"));
        assert!(vars.contains("perf_signed"));
        let envoi_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM contact_template_envois WHERE contact_id = ?1",
                params![client],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(envoi_count, 1);
    }

    #[test]
    fn prepare_campaign_skips_already_sent_envoi() {
        let db = Database::open_in_memory_for_tests().unwrap();
        db.ensure_stellium_perf_email_templates().unwrap();

        let client = db
            .create_contact(NewContact {
                email: Some("sent@example.com".into()),
                ..sample_client("NOM1", "Client")
            })
            .unwrap()
            .id
            .unwrap();

        let (inv, releve) = seed_stellium_investment(&db, client, "AV Sent", "666", 30_000);
        let input = PrepareStelliumPerfCampaignInput {
            periode: "Juin 2026".into(),
            releve_date_unix: releve,
            investissement_ids: vec![inv],
        };
        db.prepare_stellium_perf_campaign(input.clone()).unwrap();

        db.conn
            .execute(
                "UPDATE contact_template_envois SET email_envoye = 1 WHERE contact_id = ?1",
                params![client],
            )
            .unwrap();

        let result = db.prepare_stellium_perf_campaign(input).unwrap();
        assert_eq!(result.contacts_skipped_already_sent, 1);
        assert_eq!(result.contacts_queued, 0);
    }

    #[test]
    fn discover_prepare_input_uses_latest_stellium_releve_date() {
        use crate::database::models::{NewContact, NewInvestissement, NewInvestissementValorisation};

        let db = Database::open_in_memory_for_tests().unwrap();
        assert!(db
            .discover_stellium_perf_campaign_prepare_input()
            .unwrap()
            .is_none());

        let cid = db
            .create_contact(NewContact {
                categorie: "CLIENT".into(),
                nom: "DUPONT".into(),
                prenom: "Jean".into(),
                statut_suivi: Some("ACTIF".into()),
                famille_id: None,
                foyer_id: None,
                role_foyer: None,
                role_famille: None,
                filleul_categorie: None,
                parrain_id: None,
                prescripteur_id: None,
                civilite: None,
                email: Some("j@example.com".into()),
                telephone: None,
                adresse: None,
                code_postal: None,
                ville: None,
                pays: None,
                date_naissance: None,
                lieu_naissance: None,
                profession: None,
                situation_familiale: None,
                regime_matrimonial: None,
                revenus_annuels: None,
                charges_emprunts: None,
                epargne_precaution_souhaitee: None,
                objectifs_patrimoniaux: None,
                source_lead: None,
                profil_risque_sri: None,
                date_dernier_contact: None,
                date_prochain_suivi: None,
                date_dernier_contact_filleul: None,
                date_prochain_suivi_filleul: None,
                notes: None,
                registre: None,
                famille_regroupement_exclu: None,
            })
            .unwrap()
            .id
            .unwrap();

        let inv = db
            .create_investissement(NewInvestissement {
                contact_id: Some(cid),
                foyer_id: None,
                type_produit: "ASSURANCE_VIE".into(),
                partenaire_id: None,
                nom_produit: "AV".into(),
                numero_contrat: Some("777".into()),
                montant_initial: Some(1_000_000),
                date_souscription: None,
                date_fin_demembrement: None,
                date_fin_pret: None,
                mensualite_credit: None,
                credit_crd: None,
                loyer_mensuel: None,
                versement_programme: Some(false),
                montant_versement_programme: None,
                frequence_versement: None,
                reinvestissement_dividendes: Some(false),
                notes: None,
                origine: Some("MON_CONSEIL".into()),
            })
            .unwrap()
            .id;

        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv,
            montant: 1_050_000,
            date_valorisation: Some("2026-05-19T00:00:00.000Z".into()),
            notes: Some("Import Stellium contrats".into()),
            stellium_versements_nets_centimes: Some(1_000_000),
            stellium_perf_euro_centimes: Some(40_000),
        })
        .unwrap();
        db.create_investissement_valorisation(NewInvestissementValorisation {
            investissement_id: inv,
            montant: 1_060_000,
            date_valorisation: Some("2026-06-19T00:00:00.000Z".into()),
            notes: Some("Import Stellium contrats".into()),
            stellium_versements_nets_centimes: Some(1_000_000),
            stellium_perf_euro_centimes: Some(60_000),
        })
        .unwrap();

        let discovered = db
            .discover_stellium_perf_campaign_prepare_input()
            .unwrap()
            .expect("latest releve");
        assert_eq!(discovered.investissement_ids, vec![inv]);
        assert_eq!(discovered.contract_count, 1);
        assert!(discovered.periode.contains("2026"));
    }

    #[test]
    fn stellium_template_user_customized_blocks_upgrade() {
        let vars = r#"{"corps_html":"<p>x</p>","stellium_perf_template_version":1,"stellium_perf_template_user_customized":true}"#;
        assert!(!stellium_template_needs_upgrade(Some(vars)));
        assert!(stellium_template_needs_upgrade(None));
    }

    #[test]
    fn perf_intro_uses_releve_date_suffix() {
        use chrono::{TimeZone, Utc};
        let unix = Utc.with_ymd_and_hms(2026, 6, 20, 12, 0, 0).unwrap().timestamp();
        let suffix = stellium_releve_date_suffix(unix).expect("date");
        assert_eq!(suffix, "au 20/06/2026");
        let (tu, vous) = perf_intro_phrases_for_recipient(&suffix, 1, true, &[], None);
        assert_eq!(tu, "Voici la performance de ton contrat au 20/06/2026 :");
        assert_eq!(vous, "Voici la performance de votre contrat au 20/06/2026 :");
        let (tu_multi, _) = perf_intro_phrases_for_recipient(&suffix, 2, true, &[], None);
        assert_eq!(tu_multi, "Voici la performance de tes contrats au 20/06/2026 :");
        let (tu_single, _) =
            perf_intro_phrases_for_recipient(&suffix, 1, true, &[], Some("assurance-vie - Vie Plus"));
        assert_eq!(
            tu_single,
            "Voici la performance de ton contrat assurance-vie - Vie Plus au 20/06/2026 :"
        );
    }

    #[test]
    fn contrat_labels_parent_with_children() {
        let contracts = vec![
            ContractPerfLine {
                investissement_id: 1,
                type_produit: "ASSURANCE_VIE".into(),
                numero_contrat: None,
                encours_centimes: 0,
                nets_centimes: None,
                perf_euro_centimes: None,
                owner_prenom: None,
                partenaire_nom: None,
            },
            ContractPerfLine {
                investissement_id: 2,
                type_produit: "ASSURANCE_VIE".into(),
                numero_contrat: None,
                encours_centimes: 0,
                nets_centimes: None,
                perf_euro_centimes: None,
                owner_prenom: Some("Lucas".into()),
                partenaire_nom: None,
            },
            ContractPerfLine {
                investissement_id: 3,
                type_produit: "ASSURANCE_VIE".into(),
                numero_contrat: None,
                encours_centimes: 0,
                nets_centimes: None,
                perf_euro_centimes: None,
                owner_prenom: Some("Emma".into()),
                partenaire_nom: None,
            },
        ];
        let labels = contrat_labels_for_recipient(&contracts, "Amandine");
        assert_eq!(
            labels,
            vec![
                "Contrat Amandine",
                "Contrat Lucas",
                "Contrat Emma",
            ]
        );
    }

    #[test]
    fn contract_product_label_uses_type_and_partenaire_only() {
        let line = ContractPerfLine {
            investissement_id: 1,
            type_produit: "ASSURANCE_VIE".into(),
            numero_contrat: None,
            encours_centimes: 0,
            nets_centimes: None,
            perf_euro_centimes: None,
            owner_prenom: None,
            partenaire_nom: Some("Generali".into()),
        };
        assert_eq!(
            contract_product_label(&line),
            "assurance-vie - Generali"
        );
        let sans_partenaire = ContractPerfLine {
            partenaire_nom: None,
            ..line
        };
        assert_eq!(contract_product_label(&sans_partenaire), "assurance-vie");
    }

    #[test]
    fn stellium_template_content_preserved_when_sujet_edited() {
        assert!(stellium_template_content_preserved(
            None,
            "Mon objet perso",
            stellium_vous_corps_plain(),
            false
        ));
    }

    #[test]
    fn build_contract_line_html_uses_custom_html_template() {
        let line = ContractPerfLine {
            investissement_id: 1,
            type_produit: "ASSURANCE_VIE".into(),
            numero_contrat: Some("123".into()),
            encours_centimes: 594_602,
            nets_centimes: Some(504_084),
            perf_euro_centimes: Some(90_518),
            owner_prenom: None,
            partenaire_nom: None,
        };
        let formats = StelliumLineFormats {
            plain_vous: DEFAULT_METRICS_PLAIN_VOUS.into(),
            plain_tu: DEFAULT_METRICS_PLAIN_TU.into(),
            html_vous: Some(
                "<ul><li><strong>Valeur :</strong> {{encours}}</li></ul>".into(),
            ),
            html_tu: None,
        };
        let html = build_contract_line_html(&line, "Contrat Marie", &formats, false, true);
        assert!(html.contains("<strong>Valeur :</strong>"));
        assert!(html.contains("5 946,02 €"));
        assert!(!html.contains("<ul><li><strong>Valeur :</strong> {{encours}}"));
    }

    #[test]
    fn merge_stellium_template_variables_replaces_legacy_line_format() {
        let legacy = r#"{"corps_html":"<p>x</p>","stellium_perf_line_plain_vous":"{{produit}}\nEncours {{encours}}"}"#;
        let merged = merge_stellium_template_variables(Some(legacy), "<p>x</p>", false);
        let parsed: serde_json::Value = serde_json::from_str(&merged).unwrap();
        assert_eq!(
            parsed["stellium_perf_line_plain_vous"].as_str().unwrap(),
            DEFAULT_METRICS_PLAIN_VOUS
        );
    }

    #[test]
    fn single_contract_html_uses_bullets_without_header() {
        let contracts = vec![ContractPerfLine {
            investissement_id: 1,
            type_produit: "ASSURANCE_VIE".into(),
            numero_contrat: Some("123".into()),
            encours_centimes: 594_602,
            nets_centimes: Some(504_084),
            perf_euro_centimes: Some(90_518),
            owner_prenom: None,
            partenaire_nom: None,
        }];
        let resume = build_perf_resume(&contracts, "Luc", &StelliumLineFormats::default());
        assert!(!resume.html_tu.contains("Contrat Luc"));
        assert!(resume.html_tu.contains("<ul"));
        assert!(resume.html_tu.contains("<strong>Valeur actuelle :</strong>"));
        assert!(resume.html_tu.contains("5 946,02 €"));
    }

    #[test]
    fn fix_stellium_tu_corps_html_repairs_orphan_suffix() {
        let raw = "<div>{{perf_intro_tu}}</div><div>{{perf_detail_html}}_tu</div>";
        let fixed = fix_stellium_tu_corps_html(raw);
        assert!(fixed.contains("{{perf_detail_html_tu}}"));
        assert!(!fixed.contains("}}_tu"));
        assert!(!fixed.contains("{{perf_detail_tu}}"));
    }

    #[test]
    fn fix_stellium_tu_corps_html_from_plain_detail() {
        let raw = "<div>{{perf_intro_tu}}</div><div>{{perf_detail_tu}}</div>";
        let fixed = fix_stellium_tu_corps_html(raw);
        assert!(fixed.contains("{{perf_detail_html_tu}}"));
        assert!(!fixed.contains("{{perf_detail_tu}}"));
    }

    #[test]
    fn fix_stellium_tu_corps_plain_repairs_orphan_suffix() {
        let raw = "Bonjour {{prenom}},\n\n{{perf_intro_tu}}\n\n{{perf_detail}}_tu\n\nBonne journée.";
        let fixed = fix_stellium_tu_corps_plain(raw);
        assert!(fixed.contains("{{perf_detail_tu}}"));
        assert!(!fixed.contains("}}_tu"));
    }
}
