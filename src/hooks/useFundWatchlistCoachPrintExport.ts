import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import type { FundWatchlistFavoritesReport } from "@/lib/api/tauri-fund-watchlist";
import {
  buildFundWatchlistCoachPdfFilename,
  buildFundWatchlistCoachPdfFilenameStem,
} from "@/lib/fund-watchlist/fund-watchlist-coach-pdf-filename";
import type { FundWatchlistCoachPrintDocument } from "@/lib/fund-watchlist/fund-watchlist-coach-print";

const COACH_PRINT_HTML_CLASS = "coach-printing";
const COACH_PRINT_TOAST_ID = "fund-watchlist-coach-print";
const PRINT_DIALOG_SAFETY_MS = 5_000;
const PRINT_BLOCKING_MS = 100;

function clearPrintState(setBundle: (value: FundWatchlistCoachPrintDocument | null) => void) {
  globalThis.document.documentElement.classList.remove(COACH_PRINT_HTML_CLASS);
  setBundle(null);
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function waitForCoachPrintPortalReady(): Promise<void> {
  return new Promise((resolve) => {
    const portal = globalThis.document.getElementById("coach-print-portal");
    if (!portal) {
      resolve();
      return;
    }
    const body = portal.querySelector(".coach-print-body");
    if (body && body.textContent && body.textContent.trim().length > 0) {
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
      const el = globalThis.document.querySelector("#coach-print-portal .coach-print-body");
      if (el?.textContent?.trim()) finish();
    });
    observer.observe(portal, { childList: true, subtree: true, characterData: true });
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

export function useFundWatchlistCoachPrintExport() {
  const [printBundle, setPrintBundle] = useState<FundWatchlistCoachPrintDocument | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const printingRef = useRef(false);

  useEffect(() => {
    return () => {
      globalThis.document.documentElement.classList.remove(COACH_PRINT_HTML_CLASS);
      toast.dismiss(COACH_PRINT_TOAST_ID);
    };
  }, []);

  const printReport = useCallback(async (report: FundWatchlistFavoritesReport) => {
    if (printingRef.current || !report.markdown.trim()) return;

    printingRef.current = true;
    setIsPrinting(true);
    const previousTitle = globalThis.document.title;
    const printTitle = buildFundWatchlistCoachPdfFilenameStem(report.generated_at);
    const filename = buildFundWatchlistCoachPdfFilename(report.generated_at);

    toast.info(
      `Choisissez « Enregistrer au format PDF » — nom proposé : ${filename}.`,
      { id: COACH_PRINT_TOAST_ID, duration: Infinity }
    );

    try {
      flushSync(() => setPrintBundle({ report }));
      globalThis.document.title = printTitle;
      globalThis.document.documentElement.classList.add(COACH_PRINT_HTML_CLASS);
      await waitForCoachPrintPortalReady();
      await waitForNextFrame();
      await waitForPrintDialogClose();
    } catch (error) {
      console.error("Erreur export PDF rapport Coach:", error);
      toast.error("Échec de l'export PDF. Réessayez.");
      clearPrintState(setPrintBundle);
    } finally {
      globalThis.document.title = previousTitle;
      clearPrintState(setPrintBundle);
      toast.dismiss(COACH_PRINT_TOAST_ID);
      printingRef.current = false;
      setIsPrinting(false);
    }
  }, []);

  return { printBundle, printReport, isPrinting };
}
