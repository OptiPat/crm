//! Pipeline bulletins SCPI : PDF → OCR → résumé → prepare campagne.

use super::mistral::{mistral_ocr_pdf, mistral_summarize_scpi_bulletin, SCPI_BULLETIN_CHAT_MODEL};
use super::nom_produit::{
    align_nom_produit_with_portfolio, guess_periode, pick_nom_produit, scpi_name_from_file_name,
};
use crate::database::scpi_campaigns::{
    PrepareScpiCampaignInput, PrepareScpiCampaignResult, ScpiBulletinInput,
};
use crate::database::Database;
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScpiBulletinProgress {
    pub phase: String,
    pub current: u32,
    pub total: u32,
    pub file_name: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct ProcessedScpiBulletinBatch {
    pub periode: String,
    pub bulletins: Vec<ScpiBulletinInput>,
}

fn file_name_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
        .to_string()
}

fn emit_progress(app: &AppHandle, progress: &ScpiBulletinProgress) {
    let _ = app.emit("scpi-bulletin-progress", progress);
}

/// OCR + résumés Mistral — sans accès SQLite (peut durer plusieurs minutes).
pub fn process_scpi_bulletin_pdfs(
    app: &AppHandle,
    api_key: &str,
    pdf_paths: &[String],
    portfolio: &[String],
) -> Result<ProcessedScpiBulletinBatch, String> {
    if pdf_paths.is_empty() {
        return Err("Sélectionnez au moins un PDF bulletin.".into());
    }

    let total = pdf_paths.len() as u32;
    let mut bulletins: Vec<ScpiBulletinInput> = Vec::new();
    let mut periode: Option<String> = None;

    for (index, path) in pdf_paths.iter().enumerate() {
        let file_name = file_name_from_path(path);
        if !file_name.to_lowercase().ends_with(".pdf") {
            return Err(format!("Fichier non PDF ignoré : {file_name}"));
        }
        let current = (index + 1) as u32;
        let scpi_name = scpi_name_from_file_name(&file_name);

        emit_progress(
            app,
            &ScpiBulletinProgress {
                phase: "ocr".into(),
                current,
                total,
                file_name: Some(file_name.clone()),
                message: format!("OCR Mistral — {file_name} ({current}/{total})"),
            },
        );

        let pdf_bytes = std::fs::read(path)
            .map_err(|e| format!("Impossible de lire {file_name} : {e}"))?;

        let ocr = mistral_ocr_pdf(api_key, &pdf_bytes, &file_name)?;

        emit_progress(
            app,
            &ScpiBulletinProgress {
                phase: "summary".into(),
                current,
                total,
                file_name: Some(file_name.clone()),
                message: format!("Résumé Mistral — {file_name} ({current}/{total})"),
            },
        );

        let summary_email = mistral_summarize_scpi_bulletin(
            api_key,
            SCPI_BULLETIN_CHAT_MODEL,
            &file_name,
            &scpi_name,
            &ocr,
        )?;

        let guess = pick_nom_produit(&summary_email, &file_name, &scpi_name);
        let nom_produit = align_nom_produit_with_portfolio(&guess, portfolio);

        if periode.is_none() {
            periode = Some(guess_periode(&file_name, &summary_email));
        }

        bulletins.push(ScpiBulletinInput {
            nom_produit,
            summary_markdown: summary_email,
            fichier_source: Some(file_name),
        });
    }

    Ok(ProcessedScpiBulletinBatch {
        periode: periode.unwrap_or_else(|| "Trimestre".into()),
        bulletins,
    })
}

pub fn prepare_processed_scpi_bulletin_batch(
    app: &AppHandle,
    database: &Database,
    batch: ProcessedScpiBulletinBatch,
) -> Result<PrepareScpiCampaignResult, String> {
    let total = batch.bulletins.len() as u32;

    emit_progress(
        app,
        &ScpiBulletinProgress {
            phase: "prepare".into(),
            current: total,
            total,
            file_name: None,
            message: format!("Préparation campagne {}…", batch.periode),
        },
    );

    let result = database
        .prepare_scpi_bulletin_campaign(PrepareScpiCampaignInput {
            periode: batch.periode,
            bulletins: batch.bulletins,
        })
        .map_err(|e| format!("Prepare campagne : {e}"))?;

    emit_progress(
        app,
        &ScpiBulletinProgress {
            phase: "done".into(),
            current: total,
            total,
            file_name: None,
            message: result.message.clone(),
        },
    );

    Ok(result)
}
