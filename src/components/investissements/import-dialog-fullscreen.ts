import { parseImportDate } from "@/lib/contacts/parse-import-date";

/** Plein écran pour les assistants d'import Excel (immobilier, placements). */
export const IMPORT_DIALOG_CONTENT_CLASS =
  "!left-0 !top-0 !translate-x-0 !translate-y-0 flex h-[100dvh] w-screen max-h-[100dvh] max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none sm:rounded-none";

export const IMPORT_DIALOG_HEADER_CLASS = "shrink-0 space-y-1.5 border-b px-6 py-4 text-left";

export const IMPORT_DIALOG_BODY_CLASS = "min-h-0 flex-1 overflow-y-auto px-6 py-4";

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
