import { toast } from "sonner";
import { writeDownloadsFileBytes } from "@/lib/api/tauri-arbitrage-fiche";
import { openDocumentFile } from "@/lib/api/tauri-system";
import { isMacPrintPlatform } from "@/lib/souscription-cif/cif-print-dialog";

/**
 * Enregistre un fichier généré par l'interface (CSV, PDF…).
 *
 * Windows (WebView2) : lien `<a download>`, la WebView télécharge d'elle-même.
 * macOS (WKWebView) : sans gestionnaire `on_download` côté Tauri, wry annule tout
 * téléchargement — le clic ne produirait aucun fichier. On écrit donc directement
 * dans Téléchargements via la commande Rust, comme l'export PDF CIF.
 */
export function downloadBlobFile(filename: string, blob: Blob): void {
  if (typeof navigator !== "undefined" && isMacPrintPlatform(navigator)) {
    void saveBlobToDownloads(filename, blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function saveBlobToDownloads(filename: string, blob: Blob): Promise<void> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const savedPath = await writeDownloadsFileBytes(filename, bytes);
    toast.success(`${filename} enregistré dans Téléchargements.`, {
      action: {
        label: "Ouvrir",
        onClick: () => {
          void openDocumentFile(savedPath).catch(() => {
            toast.error("Ouverture du fichier impossible.");
          });
        },
      },
    });
  } catch (error) {
    console.error("Enregistrement dans Téléchargements:", error);
    const detail = error instanceof Error ? error.message : String(error ?? "");
    toast.error(detail ? `Export impossible : ${detail}` : "Export impossible.");
  }
}
