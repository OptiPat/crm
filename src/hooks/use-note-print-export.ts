import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { buildNotePdfFilename, buildNotePdfFilenameStem } from "@/lib/notes/note-pdf-filename";
import type { NotePrintDocument } from "@/lib/notes/note-print";

const NOTE_PRINT_HTML_CLASS = "note-printing";
const NOTE_PRINT_TOAST_ID = "note-print-export";
const PRINT_DIALOG_SAFETY_MS = 5_000;
const PRINT_BLOCKING_MS = 100;

function clearPrintState(setBundle: (value: NotePrintDocument | null) => void) {
  document.documentElement.classList.remove(NOTE_PRINT_HTML_CLASS);
  setBundle(null);
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

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

export function useNotePrintExport() {
  const [printBundle, setPrintBundle] = useState<NotePrintDocument | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const printingRef = useRef(false);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove(NOTE_PRINT_HTML_CLASS);
      toast.dismiss(NOTE_PRINT_TOAST_ID);
    };
  }, []);

  const printDocument = useCallback(async (noteDoc: NotePrintDocument) => {
    if (printingRef.current || !noteDoc.title.trim()) return;

    printingRef.current = true;
    setIsPrinting(true);
    const previousTitle = document.title;
    const printTitle = buildNotePdfFilenameStem(noteDoc.title);
    const filename = buildNotePdfFilename(noteDoc.title);

    toast.info(
      `Choisissez « Enregistrer au format PDF » — nom proposé : ${filename}.`,
      { id: NOTE_PRINT_TOAST_ID, duration: Infinity }
    );

    try {
      flushSync(() => setPrintBundle(noteDoc));
      document.title = printTitle;
      document.documentElement.classList.add(NOTE_PRINT_HTML_CLASS);
      await waitForNextFrame();
      await waitForNextFrame();
      await waitForPrintDialogClose();
    } catch (error) {
      console.error("Erreur export PDF note:", error);
      toast.error("Échec du téléchargement PDF. Réessayez.");
      clearPrintState(setPrintBundle);
    } finally {
      document.title = previousTitle;
      clearPrintState(setPrintBundle);
      toast.dismiss(NOTE_PRINT_TOAST_ID);
      printingRef.current = false;
      setIsPrinting(false);
    }
  }, []);

  return { printBundle, printDocument, isPrinting };
}
