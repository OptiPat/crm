//! Export PDF « silencieux » de la page affichée (souscription CIF), sans boîte d'impression.
//!
//! Windows : moteur WebView2 (`PrintToPdf`) → même rendu vectoriel que « Imprimer → Enregistrer
//! en PDF » (texte net et sélectionnable), écrit directement dans Téléchargements.

use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::auth::session::{require_ui_session, UiSessionState};

/// Imprime la fenêtre en PDF dans Téléchargements et renvoie le chemin du fichier créé.
#[tauri::command]
pub async fn print_window_to_downloads_pdf(
    app: AppHandle,
    window: WebviewWindow,
    session: State<'_, UiSessionState>,
    file_name: String,
) -> Result<String, String> {
    require_ui_session(&session)?;
    let download_dir = app
        .path()
        .download_dir()
        .map_err(|error| format!("Dossier Téléchargements introuvable : {error}"))?;
    let dest = crate::documents_storage::prepare_downloads_dest(&download_dir, &file_name)?;
    print_to_pdf(&window, &dest).await?;
    Ok(dest.to_string_lossy().into_owned())
}

#[cfg(windows)]
async fn print_to_pdf(window: &WebviewWindow, dest: &std::path::Path) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows_core::{Interface, HSTRING};

    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let path = HSTRING::from(dest.as_os_str());
    let failure_tx = tx.clone();

    window
        .with_webview(move |webview| {
            let start = || -> Result<(), String> {
                unsafe {
                    let core = webview
                        .controller()
                        .CoreWebView2()
                        .map_err(|e| format!("WebView2 indisponible : {e}"))?;
                    let core7: ICoreWebView2_7 = core
                        .cast()
                        .map_err(|_| "Version de WebView2 trop ancienne pour l'export PDF.".to_string())?;
                    let env6: ICoreWebView2Environment6 = webview
                        .environment()
                        .cast()
                        .map_err(|_| "Version de WebView2 trop ancienne pour l'export PDF.".to_string())?;
                    let settings = env6
                        .CreatePrintSettings()
                        .map_err(|e| format!("Réglages d'impression impossibles : {e}"))?;
                    // A4 portrait, sans marges ni en-têtes navigateur : la mise en page CIF
                    // (Paged.js + @page A4 margin 0) gère elle-même marges et pied de page.
                    let _ = settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT);
                    let _ = settings.SetPageWidth(8.27);
                    let _ = settings.SetPageHeight(11.69);
                    let _ = settings.SetMarginTop(0.0);
                    let _ = settings.SetMarginBottom(0.0);
                    let _ = settings.SetMarginLeft(0.0);
                    let _ = settings.SetMarginRight(0.0);
                    let _ = settings.SetShouldPrintBackgrounds(true);
                    let _ = settings.SetShouldPrintHeaderAndFooter(false);

                    let done_tx = tx.clone();
                    let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                        let outcome = match result {
                            Ok(()) if ok => Ok(()),
                            Ok(()) => Err("L'export PDF a échoué.".to_string()),
                            Err(e) => Err(format!("L'export PDF a échoué : {e}")),
                        };
                        let _ = done_tx.send(outcome);
                        Ok(())
                    }));
                    core7
                        .PrintToPdf(&path, &settings, &handler)
                        .map_err(|e| format!("L'export PDF a échoué : {e}"))?;
                }
                Ok(())
            };
            if let Err(error) = start() {
                let _ = failure_tx.send(Err(error));
            }
        })
        .map_err(|e| format!("Fenêtre indisponible : {e}"))?;

    // Attente hors du fil de la fenêtre (le rappel WebView2 arrive sur ce fil).
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(std::time::Duration::from_secs(120))
            .map_err(|_| "L'export PDF n'a pas abouti (délai dépassé).".to_string())?
    })
    .await
    .map_err(|e| format!("Export interrompu : {e}"))?
}

#[cfg(not(windows))]
async fn print_to_pdf(_window: &WebviewWindow, _dest: &std::path::Path) -> Result<(), String> {
    Err("Export PDF direct disponible uniquement sous Windows.".into())
}
