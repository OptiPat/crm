import { useLayoutEffect, useRef, type RefObject } from "react";
import { parseImportDate } from "@/lib/contacts/parse-import-date";

/** Plein écran pour les assistants d'import Excel (immobilier, placements). */
export const IMPORT_DIALOG_CONTENT_CLASS =
  "!left-0 !top-0 !translate-x-0 !translate-y-0 flex h-[100dvh] w-screen max-h-[100dvh] max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none sm:rounded-none";

export const IMPORT_DIALOG_HEADER_CLASS = "shrink-0 space-y-1.5 border-b px-6 py-4 text-left";

export const IMPORT_DIALOG_BODY_CLASS = "min-h-0 flex-1 overflow-y-auto px-6 py-4";

/** Remet le défilement en haut à l'ouverture de l'aperçu (évite focus footer / milieu de liste). */
export function useImportDialogPreviewBodyScroll(
  step: "pick" | "preview",
  scrollKey: string | number | null
): RefObject<HTMLDivElement | null> {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (step !== "preview" || scrollKey == null) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [step, scrollKey]);
  return bodyRef;
}

export const IMPORT_DIALOG_FOOTER_CLASS =
  "shrink-0 border-t px-6 py-4 sm:flex-row sm:justify-end";

/** Blur le champ actif puis attend le prochain frame (setState post-blur). */
export async function flushImportDialogPendingEdits(): Promise<void> {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Valeur d'un `<input type="date">` en preview import.
 * - `null` : pas de changement
 * - `undefined` : effacer la date
 * - `string` : nouvelle ISO
 */
export function commitImportDateFieldChange(
  raw: string,
  currentIso: string | undefined
): string | undefined | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return currentIso == null ? null : undefined;
  }
  const iso = parseImportDate(trimmed);
  if (!iso || iso === currentIso) return null;
  return iso;
}

const PLACEMENT_DATE_PATCH_KEYS = new Set(["dateEffetIso", "dateSortieIso"]);
const IMMO_DATE_PATCH_KEYS = new Set(["dateActeIso"]);

/** Patch date seul : ne pas réévaluer toutes les lignes (évite effets de bord / sauts de section). */
export function isPlacementDateOnlyPreviewPatch(
  patch: Record<string, unknown>
): boolean {
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((k) => PLACEMENT_DATE_PATCH_KEYS.has(k));
}

export function isImmoDateOnlyPreviewPatch(patch: Record<string, unknown>): boolean {
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((k) => IMMO_DATE_PATCH_KEYS.has(k));
}
