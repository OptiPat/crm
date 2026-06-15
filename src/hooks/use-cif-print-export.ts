import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import {
  buildCifPdfFilename,
  buildCifPdfFilenameStem,
} from "@/lib/souscription-cif/cif-pdf-filename";
import type { CifPrintDocument } from "@/lib/souscription-cif/cif-print-export";

const CIF_PRINT_HTML_CLASS = "cif-printing";
const CIF_PRINT_TOAST_ID = "cif-print-export";
/** Filet si afterprint / retour focus ne se déclenchent pas (ex. annulation WebView2). */
const PRINT_DIALOG_SAFETY_MS = 5_000;
/** Seuil au-delà duquel window.print() est considéré bloquant (boîte déjà fermée au retour). */
const PRINT_BLOCKING_MS = 100;

function clearPrintState(setBundle: (value: CifPrintDocument[] | null) => void) {
  document.documentElement.classList.remove(CIF_PRINT_HTML_CLASS);
  setBundle(null);
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Attend la fermeture de la boîte d'impression.
 * @returns true si l'utilisateur a probablement enregistré, false si annulation (heuristique media print).
 */
function waitForPrintDialogClose(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let sawPrintMedia = false;
    const mql = window.matchMedia("print");

    if (mql.matches) sawPrintMedia = true;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("afterprint", finish);
      mql.removeEventListener("change", onMediaChange);
      window.clearTimeout(safetyTimer);
      resolve(sawPrintMedia);
    };

    const onMediaChange = () => {
      if (mql.matches) sawPrintMedia = true;
    };

    window.addEventListener("afterprint", finish);
    mql.addEventListener("change", onMediaChange);
    const safetyTimer = window.setTimeout(finish, PRINT_DIALOG_SAFETY_MS);

    const startedAt = performance.now();
    window.print();

    if (performance.now() - startedAt > PRINT_BLOCKING_MS) {
      finish();
    }
  });
}

function showPrintHint(message: string) {
  toast.info(message, { id: CIF_PRINT_TOAST_ID, duration: Infinity });
}

function dismissPrintHint() {
  toast.dismiss(CIF_PRINT_TOAST_ID);
}

export function useCifPrintExport() {
  const [printBundle, setPrintBundle] = useState<CifPrintDocument[] | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const printingRef = useRef(false);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove(CIF_PRINT_HTML_CLASS);
      dismissPrintHint();
    };
  }, []);

  const runPrintJob = useCallback(async (documents: CifPrintDocument[], clientName: string) => {
    const previousTitle = document.title;
    const printTitle = documents[0]
      ? buildCifPdfFilenameStem(documents[0].label, clientName)
      : previousTitle;

    flushSync(() => setPrintBundle(documents));
    document.title = printTitle;
    document.documentElement.classList.add(CIF_PRINT_HTML_CLASS);
    await waitForNextFrame();
    let completed = false;
    try {
      completed = await waitForPrintDialogClose();
    } finally {
      document.title = previousTitle;
      clearPrintState(setPrintBundle);
      await waitForNextFrame();
    }
    return completed;
  }, []);

  const printDocuments = useCallback(
    async (documents: CifPrintDocument[], clientDisplayName: string) => {
      if (printingRef.current || documents.length === 0) return;

      printingRef.current = true;
      setIsPrinting(true);
      const clientName = clientDisplayName.trim() || "Client";

      try {
        if (documents.length === 1) {
          const doc = documents[0]!;
          const filename = buildCifPdfFilename(doc.label, clientName);
          showPrintHint(
            `Choisissez « Enregistrer au format PDF » — nom proposé : ${filename}. Annuler ferme la fenêtre.`
          );
          await runPrintJob(documents, clientName);
          return;
        }

        showPrintHint(
          `${documents.length} fenêtres à la suite — annuler une fenêtre arrête tout l'export.`
        );

        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i]!;
          const filename = buildCifPdfFilename(doc.label, clientName);
          showPrintHint(
            `Document ${i + 1}/${documents.length} — enregistrez : ${filename} (Annuler = tout arrêter)`
          );
          const completed = await runPrintJob([doc], clientName);
          if (!completed) {
            toast.info("Export interrompu — les documents suivants ne seront pas proposés.");
            break;
          }
        }
      } catch (error) {
        console.error("Erreur export PDF CIF:", error);
        toast.error("Échec du téléchargement PDF. Réessayez.");
        clearPrintState(setPrintBundle);
      } finally {
        dismissPrintHint();
        printingRef.current = false;
        setIsPrinting(false);
      }
    },
    [runPrintJob]
  );

  return { printBundle, printDocuments, isPrinting };
}
