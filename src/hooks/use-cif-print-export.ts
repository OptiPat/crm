import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import {
  buildCifPdfFilename,
  buildCifPdfFilenameStem,
} from "@/lib/souscription-cif/cif-pdf-filename";
import {
  isMacPrintPlatform,
  macContinueClickCounts,
  waitForCifPrintDialogClose,
} from "@/lib/souscription-cif/cif-print-dialog";
import type { CifPrintDocument } from "@/lib/souscription-cif/cif-print-export";

const CIF_PRINT_HTML_CLASS = "cif-printing";
const CIF_PRINT_TOAST_ID = "cif-print-export";
const MAC_CONTINUE_LABEL = "J'ai enregistré";

type ArmedContinue = { id: number; armedAt: number; run: () => void };

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

/** Délai max d'attente de la pagination Paged.js avant impression (filet anti-blocage). */
const PAGED_READY_TIMEOUT_MS = 10_000;

/** Attend que le portail d'impression ait fini de paginer (data-paged-ready="true"). */
function waitForCifPagedReady(): Promise<void> {
  return new Promise((resolve) => {
    const portal = document.getElementById("cif-print-portal");
    if (!portal) {
      resolve();
      return;
    }
    if (portal.dataset.pagedReady === "true") {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (portal.dataset.pagedReady === "true") finish();
    });
    observer.observe(portal, {
      attributes: true,
      attributeFilter: ["data-paged-ready"],
    });
    const timer = window.setTimeout(finish, PAGED_READY_TIMEOUT_MS);
  });
}

function showPrintHint(message: string, onContinue?: () => void) {
  toast.info(message, {
    id: CIF_PRINT_TOAST_ID,
    duration: Infinity,
    ...(onContinue ? { action: { label: MAC_CONTINUE_LABEL, onClick: onContinue } } : {}),
  });
}

function dismissPrintHint() {
  toast.dismiss(CIF_PRINT_TOAST_ID);
}

export function useCifPrintExport() {
  const [printBundle, setPrintBundle] = useState<CifPrintDocument[] | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const printingRef = useRef(false);
  const continueRef = useRef<ArmedContinue | null>(null);
  const continueIdRef = useRef(0);

  const registerContinue = useCallback((continueExport: () => void) => {
    const id = continueIdRef.current + 1;
    continueIdRef.current = id;
    continueRef.current = { id, armedAt: performance.now(), run: continueExport };
  }, []);

  const onMacContinue = useCallback(() => {
    const armed = continueRef.current;
    if (!armed) return;
    if (!macContinueClickCounts(performance.now() - armed.armedAt)) return;
    if (continueRef.current !== armed) return;
    continueRef.current = null;
    armed.run();
  }, []);

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
    await waitForCifPagedReady();
    await waitForNextFrame();
    let completed = false;
    try {
      completed = await waitForCifPrintDialogClose(window, () => performance.now(), registerContinue);
    } finally {
      document.title = previousTitle;
      clearPrintState(setPrintBundle);
      await waitForNextFrame();
    }
    return completed;
  }, [registerContinue]);

  const printDocuments = useCallback(
    async (documents: CifPrintDocument[], clientDisplayName: string) => {
      if (printingRef.current || documents.length === 0) return;

      printingRef.current = true;
      setIsPrinting(true);
      const clientName = clientDisplayName.trim() || "Client";
      const macPrint = isMacPrintPlatform(navigator);

      try {
        if (documents.length === 1) {
          const doc = documents[0]!;
          const filename = buildCifPdfFilename(doc.label, clientName);
          showPrintHint(
            `Choisissez « Enregistrer au format PDF » — nom proposé : ${filename}. Annuler ferme la fenêtre.`,
            macPrint ? onMacContinue : undefined
          );
          await runPrintJob(documents, clientName);
          return;
        }

        showPrintHint(
          macPrint
            ? `${documents.length} fenêtres à la suite — fermez chaque fenêtre pour passer à la suivante.`
            : `${documents.length} fenêtres à la suite — annuler une fenêtre arrête tout l'export.`,
          macPrint ? onMacContinue : undefined
        );

        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i]!;
          const filename = buildCifPdfFilename(doc.label, clientName);
          showPrintHint(
            macPrint
              ? `Document ${i + 1}/${documents.length} — enregistrez : ${filename}. Fermez la fenêtre, ou « ${MAC_CONTINUE_LABEL} ».`
              : `Document ${i + 1}/${documents.length} — enregistrez : ${filename} (Annuler = tout arrêter)`,
            macPrint ? onMacContinue : undefined
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
        continueRef.current = null;
        dismissPrintHint();
        printingRef.current = false;
        setIsPrinting(false);
      }
    },
    [onMacContinue, runPrintJob]
  );

  return { printBundle, printDocuments, isPrinting };
}
