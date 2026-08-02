//! Modèles PDF fiche conseil arbitrage AV / PER (bibliothèque locale sous AppData).

use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const ARBITRAGE_AV_FICHE_LEGACY_FILE: &str = "arbitrage-av-fiche-conseil.pdf";
const MANIFEST_FILE: &str = "manifest.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArbitrageFicheProduct {
    Av,
    Per,
}

impl ArbitrageFicheProduct {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_uppercase().as_str() {
            "AV" | "ASSURANCE_VIE" => Ok(Self::Av),
            "PER" => Ok(Self::Per),
            _ => Err("Type de fiche invalide (AV ou PER).".into()),
        }
    }

    fn dir_name(self) -> &'static str {
        match self {
            Self::Av => "arbitrage-av",
            Self::Per => "arbitrage-per",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArbitrageFicheTemplate {
    pub id: String,
    pub label: String,
    pub is_default: bool,
    pub created_at: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Manifest {
    templates: Vec<ArbitrageFicheTemplate>,
}

pub fn pdf_templates_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("pdf-templates")
}

fn templates_dir(app_data_dir: &Path, product: ArbitrageFicheProduct) -> PathBuf {
    pdf_templates_dir(app_data_dir).join(product.dir_name())
}

fn manifest_path(app_data_dir: &Path, product: ArbitrageFicheProduct) -> PathBuf {
    templates_dir(app_data_dir, product).join(MANIFEST_FILE)
}

fn template_pdf_path(app_data_dir: &Path, product: ArbitrageFicheProduct, id: &str) -> PathBuf {
    templates_dir(app_data_dir, product).join(format!("{id}.pdf"))
}

fn legacy_template_path(app_data_dir: &Path) -> PathBuf {
    pdf_templates_dir(app_data_dir).join(ARBITRAGE_AV_FICHE_LEGACY_FILE)
}

fn new_template_id() -> String {
    let suffix: u32 = rand::thread_rng().gen();
    format!("{}_{suffix:08x}", chrono::Utc::now().timestamp_millis())
}

fn read_manifest(app_data_dir: &Path, product: ArbitrageFicheProduct) -> Result<Manifest, String> {
    let path = manifest_path(app_data_dir, product);
    if !path.is_file() {
        return Ok(Manifest::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Lecture manifeste impossible : {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Manifeste modèles invalide : {e}"))
}

fn write_manifest(
    app_data_dir: &Path,
    product: ArbitrageFicheProduct,
    manifest: &Manifest,
) -> Result<(), String> {
    let dir = templates_dir(app_data_dir, product);
    fs::create_dir_all(&dir).map_err(|e| format!("Création dossier modèles impossible : {e}"))?;
    let raw =
        serde_json::to_string_pretty(manifest).map_err(|e| format!("Sérialisation manifeste : {e}"))?;
    fs::write(manifest_path(app_data_dir, product), raw)
        .map_err(|e| format!("Écriture manifeste impossible : {e}"))
}

fn migrate_legacy_av_template_if_needed(app_data_dir: &Path) -> Result<(), String> {
    let legacy = legacy_template_path(app_data_dir);
    if !legacy.is_file() {
        return Ok(());
    }
    let mut manifest = read_manifest(app_data_dir, ArbitrageFicheProduct::Av)?;
    if !manifest.templates.is_empty() {
        return Ok(());
    }
    let id = new_template_id();
    let dest = template_pdf_path(app_data_dir, ArbitrageFicheProduct::Av, &id);
    fs::create_dir_all(templates_dir(app_data_dir, ArbitrageFicheProduct::Av))
        .map_err(|e| format!("Création dossier modèles impossible : {e}"))?;
    fs::copy(&legacy, &dest).map_err(|e| format!("Migration modèle legacy impossible : {e}"))?;
    manifest.templates.push(ArbitrageFicheTemplate {
        id,
        label: "Modèle importé".into(),
        is_default: true,
        created_at: chrono::Utc::now().to_rfc3339(),
    });
    write_manifest(app_data_dir, ArbitrageFicheProduct::Av, &manifest)?;
    let _ = fs::remove_file(&legacy);
    Ok(())
}

pub fn list_arbitrage_fiche_templates(
    app_data_dir: &Path,
    product: ArbitrageFicheProduct,
) -> Result<Vec<ArbitrageFicheTemplate>, String> {
    if product == ArbitrageFicheProduct::Av {
        migrate_legacy_av_template_if_needed(app_data_dir)?;
    }
    let manifest = read_manifest(app_data_dir, product)?;
    let mut templates = manifest.templates;
    templates.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
    Ok(templates)
}

pub fn import_arbitrage_fiche_template(
    app_data_dir: &Path,
    product: ArbitrageFicheProduct,
    source: &Path,
    label: &str,
) -> Result<ArbitrageFicheTemplate, String> {
    if !source.is_file() {
        return Err("Fichier modèle introuvable.".into());
    }
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if !ext.eq_ignore_ascii_case("pdf") {
        return Err("Le modèle doit être un fichier PDF.".into());
    }
    let trimmed_label = label.trim();
    if trimmed_label.is_empty() {
        return Err("Nom du modèle requis.".into());
    }

    if product == ArbitrageFicheProduct::Av {
        migrate_legacy_av_template_if_needed(app_data_dir)?;
    }
    let mut manifest = read_manifest(app_data_dir, product)?;
    let id = new_template_id();
    let dest = template_pdf_path(app_data_dir, product, &id);
    fs::create_dir_all(templates_dir(app_data_dir, product))
        .map_err(|e| format!("Création dossier modèles impossible : {e}"))?;
    fs::copy(source, &dest).map_err(|e| format!("Copie du modèle impossible : {e}"))?;

    let is_default = manifest.templates.is_empty();
    let entry = ArbitrageFicheTemplate {
        id: id.clone(),
        label: trimmed_label.to_string(),
        is_default,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    manifest.templates.push(entry.clone());
    write_manifest(app_data_dir, product, &manifest)?;
    Ok(entry)
}

pub fn remove_arbitrage_fiche_template(
    app_data_dir: &Path,
    product: ArbitrageFicheProduct,
    id: &str,
) -> Result<(), String> {
    if product == ArbitrageFicheProduct::Av {
        migrate_legacy_av_template_if_needed(app_data_dir)?;
    }
    let mut manifest = read_manifest(app_data_dir, product)?;
    let before = manifest.templates.len();
    manifest.templates.retain(|t| t.id != id);
    if manifest.templates.len() == before {
        return Err("Modèle introuvable.".into());
    }
    let pdf = template_pdf_path(app_data_dir, product, id);
    if pdf.is_file() {
        let _ = fs::remove_file(&pdf);
    }
    if manifest.templates.iter().all(|t| !t.is_default) {
        if let Some(first) = manifest.templates.first_mut() {
            first.is_default = true;
        }
    }
    write_manifest(app_data_dir, product, &manifest)
}

pub fn set_default_arbitrage_fiche_template(
    app_data_dir: &Path,
    product: ArbitrageFicheProduct,
    id: &str,
) -> Result<(), String> {
    if product == ArbitrageFicheProduct::Av {
        migrate_legacy_av_template_if_needed(app_data_dir)?;
    }
    let mut manifest = read_manifest(app_data_dir, product)?;
    let mut found = false;
    for template in &mut manifest.templates {
        let is_target = template.id == id;
        if is_target {
            found = true;
        }
        template.is_default = is_target;
    }
    if !found {
        return Err("Modèle introuvable.".into());
    }
    write_manifest(app_data_dir, product, &manifest)
}

pub fn arbitrage_fiche_template_file_path(
    app_data_dir: &Path,
    product: ArbitrageFicheProduct,
    id: &str,
) -> Result<PathBuf, String> {
    if product == ArbitrageFicheProduct::Av {
        migrate_legacy_av_template_if_needed(app_data_dir)?;
    }
    let path = template_pdf_path(app_data_dir, product, id);
    if !path.is_file() {
        return Err("Fichier modèle introuvable.".into());
    }
    Ok(path)
}

pub fn validate_pdf_template_file(app_data_dir: &Path, file_path: &Path) -> Result<PathBuf, String> {
    if !file_path.is_file() {
        return Err("Modèle PDF introuvable.".into());
    }
    let root = crate::documents_storage::normalize_path(&pdf_templates_dir(app_data_dir));
    let target = file_path
        .canonicalize()
        .map_err(|error| format!("Chemin de modèle invalide : {error}"))?;
    if !target.starts_with(&root) {
        return Err("Accès refusé : modèle PDF hors dossier autorisé.".into());
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_app_data() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "crm-arbitrage-templates-{}",
            rand::thread_rng().gen::<u32>()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_dummy_pdf(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let mut f = fs::File::create(path).unwrap();
        f.write_all(b"%PDF-1.4 dummy").unwrap();
    }

    #[test]
    fn import_list_av_and_per_separately() {
        let app_data = temp_app_data();
        let av_source = app_data.join("av.pdf");
        write_dummy_pdf(&av_source);
        import_arbitrage_fiche_template(
            &app_data,
            ArbitrageFicheProduct::Av,
            &av_source,
            "AV test",
        )
        .unwrap();

        let per_source = app_data.join("per.pdf");
        write_dummy_pdf(&per_source);
        import_arbitrage_fiche_template(
            &app_data,
            ArbitrageFicheProduct::Per,
            &per_source,
            "PER test",
        )
        .unwrap();

        assert_eq!(
            list_arbitrage_fiche_templates(&app_data, ArbitrageFicheProduct::Av).unwrap().len(),
            1
        );
        assert_eq!(
            list_arbitrage_fiche_templates(&app_data, ArbitrageFicheProduct::Per).unwrap().len(),
            1
        );
    }
}
