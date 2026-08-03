import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import type { CompareResponse } from "@/lib/api/tauri-uc-comparator";
import {
  buildUcComparatorPdfFilename,
  buildUcComparatorPdfFilenameStem,
} from "@/lib/fund-watchlist/uc-comparator-pdf-filename";
import type { UcComparatorPrintDocument } from "@/lib/fund-watchlist/uc-comparator-print";

const UC_PRINT_HTML_CLASS = "uc-comparator-printing";
const UC_PRINT_TOAST_ID = "uc-comparator-print";
const PRINT_DIALOG_SAFETY_MS = 5_000;
const PRINT_BLOCKING_MS = 100;

function clearPrintState(setBundle: (value: UcComparatorPrintDocument | null) => void) {
  globalThis.document.documentElement.classList.remove(UC_PRINT_HTML_CLASS);
  setBundle(null);
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function waitForUcComparatorPrintPortalReady(): Promise<void> {
  return new Promise((resolve) => {
    const portal = globalThis.document.getElementById("uc-comparator-print-portal");
    if (portal?.textContent?.trim()) {
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
      const el = globalThis.document.getElementById("uc-comparator-print-portal");
      if (el?.textContent?.trim()) finish();
    });
    if (portal) observer.observe(portal, { childList: true, subtree: true, characterData: true });
    const timer = window.setTimeout(finish, 2_000);
  });
}

function waitForPrintDialogClose(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("afterprint", finish);
      window.clearTimeout(safetyTimer);
      resolve();
    };

    window.addEventListener("afterprint", finish);
    const safetyTimer = window.setTimeout(finish, PRINT_DIALOG_SAFETY_MS);

    const startedAt = performance.now();
    window.print();
    if (performance.now() - startedAt > PRINT_BLOCKING_MS) {
      finish();
    }
  });
}

export function useUcComparatorPrintExport() {
  const [printBundle, setPrintBundle] = useState<UcComparatorPrintDocument | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const printingRef = useRef(false);

  useEffect(() => {
    return () => {
      globalThis.document.documentElement.classList.remove(UC_PRINT_HTML_CLASS);
      toast.dismiss(UC_PRINT_TOAST_ID);
    };
  }, []);

  const printComparison = useCallback(async (response: CompareResponse) => {
    if (printingRef.current || (response.results?.length ?? 0) === 0) return;

    printingRef.current = true;
    setIsPrinting(true);
    const previousTitle = globalThis.document.title;
    const generatedAt = Math.floor(Date.now() / 1000);
    const fundNames = (response.results ?? []).map((fund) => fund.nom);
    const printTitle = buildUcComparatorPdfFilenameStem(fundNames, generatedAt);
    const filename = buildUcComparatorPdfFilename(fundNames, generatedAt);

    toast.info(`Choisissez « Enregistrer au format PDF » — nom proposé : ${filename}.`, {
      id: UC_PRINT_TOAST_ID,
      duration: Infinity,
    });

    try {
      flushSync(() => setPrintBundle({ response, generatedAt }));
      globalThis.document.title = printTitle;
      globalThis.document.documentElement.classList.add(UC_PRINT_HTML_CLASS);
      await waitForUcComparatorPrintPortalReady();
      await waitForNextFrame();
      await waitForPrintDialogClose();
    } catch (error) {
      console.error("Erreur export PDF comparatif UC:", error);
      toast.error("Échec de l'export PDF. Réessayez.");
      clearPrintState(setPrintBundle);
    } finally {
      globalThis.document.title = previousTitle;
      clearPrintState(setPrintBundle);
      toast.dismiss(UC_PRINT_TOAST_ID);
      printingRef.current = false;
      setIsPrinting(false);
    }
  }, []);

  return { printBundle, printComparison, isPrinting };
}
