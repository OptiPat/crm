// Types et utilitaires purs pour les lignes d'import de contacts.
// Extraits de ContactImport pour rester testables et légers.

export interface ImportRow {
  data: Record<string, any>;
  status: "pending" | "success" | "error" | "duplicate" | "skipped";
  message?: string;
}

/**
 * Après un rollback SQLite, le rapport ne doit plus afficher de lignes « succès » :
 * on les requalifie en erreur explicite.
 */
export function markImportRowsCancelled(rows: ImportRow[]): ImportRow[] {
  return rows.map((r) =>
    r.status === "success"
      ? { ...r, status: "error", message: "Import annulé — aucune donnée enregistrée" }
      : r
  );
}

/**
 * Date la plus récente entre une date ISO (nouvelle) et un timestamp Unix en
 * secondes (existant), pour la consolidation multi-lignes. Renvoie une date ISO.
 */
export const getMostRecentDate = (
  newDateISO: string | undefined,
  existingTimestamp: number | undefined
): string | undefined => {
  if (!newDateISO && !existingTimestamp) return undefined;

  if (!newDateISO && existingTimestamp) {
    return new Date(existingTimestamp * 1000).toISOString();
  }
  if (newDateISO && !existingTimestamp) {
    return newDateISO;
  }

  const newDate = new Date(newDateISO!);
  const existingDate = new Date(existingTimestamp! * 1000);

  return newDate > existingDate ? newDateISO : existingDate.toISOString();
};
