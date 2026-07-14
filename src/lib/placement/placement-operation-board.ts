import type { PlacementOperation, PlacementOperationWithContact } from "@/lib/api/tauri-box-placement";
import {
  getPlacementBoardActiveStepId,
  type PlacementStepperStepId,
} from "@/lib/placement/placement-operation-stepper";
import { placementOperationIsUndeclared, placementOperationIsDetachedSuiviDraft, placementOperationIsDeclaredInWorkflow, PLACEMENT_UNDECLARED_BOX_LABEL } from "@/lib/placement/placement-operations-ui";
import { placementOperationIsSuiviDraft } from "@/lib/placement/suivi-placement-draft";
import { formatStelliumProductForDisplay } from "@/lib/placement/stellium-box-placement-products";

/** 6 colonnes alignées sur le stepper Avancement (comme R1/R2/R3). */
export const PLACEMENT_BOARD_COLUMNS: PlacementStepperStepId[] = [
  "declare",
  "waiting",
  "first_response",
  "conforme_after_nc",
  "partner_fin",
  "client_mail",
];

export type PlacementBoardColumn = PlacementStepperStepId;

export const PLACEMENT_BOARD_COLUMN_LABELS: Record<PlacementBoardColumn, string> = {
  declare: "Acte",
  waiting: "En attente partenaire",
  first_response: "Réponse partenaire",
  conforme_after_nc: "Conforme",
  partner_fin: "Validé / renvoyé partenaire",
  client_mail: "Mail client",
};

/** Libellés compacts pour 6 colonnes (comme le kanban affaires). */
export const PLACEMENT_BOARD_COLUMN_LABELS_SHORT: Record<PlacementBoardColumn, string> = {
  declare: "Acte",
  waiting: "Attente",
  first_response: "Réponse",
  conforme_after_nc: "Conforme",
  partner_fin: "Partenaire",
  client_mail: "Mail",
};

export interface PlacementBoardColumnColors {
  column: string;
  accent: string;
  header: string;
  title: string;
  badge: string;
}

export const PLACEMENT_BOARD_COLUMN_COLORS: Record<PlacementBoardColumn, PlacementBoardColumnColors> =
  {
    declare: {
      column: "border-slate-200/70 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/30",
      accent: "border-t-slate-500 dark:border-t-slate-500",
      header: "border-slate-200/50 dark:border-slate-800",
      title: "text-slate-800 dark:text-slate-200",
      badge:
        "bg-slate-100 text-slate-800 border border-slate-200/80 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
    },
    waiting: {
      column:
        "border-amber-200/70 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/25",
      accent: "border-t-amber-500 dark:border-t-amber-500",
      header: "border-amber-200/50 dark:border-amber-900",
      title: "text-amber-900 dark:text-amber-200",
      badge:
        "bg-amber-100 text-amber-900 border border-amber-200/80 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
    },
    first_response: {
      column: "border-sky-200/70 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/25",
      accent: "border-t-sky-500 dark:border-t-sky-500",
      header: "border-sky-200/50 dark:border-sky-900",
      title: "text-sky-900 dark:text-sky-200",
      badge:
        "bg-sky-100 text-sky-900 border border-sky-200/80 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
    },
    conforme_after_nc: {
      column:
        "border-teal-200/70 bg-teal-50/40 dark:border-teal-900 dark:bg-teal-950/25",
      accent: "border-t-teal-500 dark:border-t-teal-500",
      header: "border-teal-200/50 dark:border-teal-900",
      title: "text-teal-900 dark:text-teal-200",
      badge:
        "bg-teal-100 text-teal-900 border border-teal-200/80 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-800",
    },
    partner_fin: {
      column:
        "border-violet-200/70 bg-violet-50/40 dark:border-violet-900 dark:bg-violet-950/25",
      accent: "border-t-violet-500 dark:border-t-violet-500",
      header: "border-violet-200/50 dark:border-violet-900",
      title: "text-violet-900 dark:text-violet-200",
      badge:
        "bg-violet-100 text-violet-900 border border-violet-200/80 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800",
    },
    client_mail: {
      column:
        "border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/25",
      accent: "border-t-emerald-500 dark:border-t-emerald-500",
      header: "border-emerald-200/50 dark:border-emerald-900",
      title: "text-emerald-800 dark:text-emerald-300",
      badge:
        "bg-emerald-100 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
    },
  };

/** Colonne tableau pour une opération encore ouverte (null = terminée, hors board). */
export function getPlacementBoardColumn(
  operation: Parameters<typeof getPlacementBoardActiveStepId>[0]
): PlacementBoardColumn | null {
  return getPlacementBoardActiveStepId(operation);
}

export { placementOperationIsDetachedSuiviDraft } from "@/lib/placement/placement-operations-ui";

export function filterPlacementRowsForBoard(
  rows: PlacementOperationWithContact[]
): PlacementOperationWithContact[] {
  return rows.filter((row) => {
    if (placementOperationIsDetachedSuiviDraft(row.operation)) return false;
    if (
      row.operation.status === "PENDING" &&
      !placementOperationIsDeclaredInWorkflow(row.operation)
    ) {
      return false;
    }
    return getPlacementBoardColumn(row.operation) != null;
  });
}

export function groupPlacementOperationsByBoardColumn(
  rows: PlacementOperationWithContact[]
): Record<PlacementBoardColumn, PlacementOperationWithContact[]> {
  const groups = Object.fromEntries(
    PLACEMENT_BOARD_COLUMNS.map((col) => [col, [] as PlacementOperationWithContact[]])
  ) as Record<PlacementBoardColumn, PlacementOperationWithContact[]>;

  for (const row of rows) {
    const col = getPlacementBoardColumn(row.operation);
    if (col) groups[col].push(row);
  }

  for (const col of PLACEMENT_BOARD_COLUMNS) {
    groups[col].sort(
      (a, b) =>
        b.operation.updated_at - a.operation.updated_at || b.operation.id - a.operation.id
    );
  }

  return groups;
}

export function formatPlacementBoardContactLabel(
  row: Pick<PlacementOperationWithContact, "contact_prenom" | "contact_nom">
): string {
  const parts = [row.contact_prenom?.trim(), row.contact_nom?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Contact";
}

/** Une ligne contact + suivi sans répéter le nom (pipe_titre prioritaire). */
export function formatPlacementBoardCardSubtitle(
  row: Pick<PlacementOperationWithContact, "contact_prenom" | "contact_nom" | "pipe_titre">
): string {
  const pipeTitre = row.pipe_titre?.trim();
  if (pipeTitre) return pipeTitre;
  return formatPlacementBoardContactLabel(row);
}

export type PlacementBoardRowBadge = "awaiting_send" | "scan_orphan";

export function placementBoardRowBadge(
  operation: Pick<PlacementOperation, "status" | "pipe_timeline_entry_id" | "email_received_at" | "pipe_id">
): PlacementBoardRowBadge | null {
  if (placementOperationIsSuiviDraft(operation)) return "awaiting_send";
  if (
    placementOperationIsUndeclared(operation) &&
    (operation.pipe_id == null || operation.pipe_id <= 0)
  ) {
    return "scan_orphan";
  }
  return null;
}

export const PLACEMENT_BOARD_BADGE_LABELS: Record<PlacementBoardRowBadge, string> = {
  awaiting_send: PLACEMENT_UNDECLARED_BOX_LABEL,
  scan_orphan: "Non rattaché",
};

export function formatPlacementBoardCardDate(
  operation: Pick<
    PlacementOperation,
    | "created_at"
    | "updated_at"
    | "email_received_at"
    | "non_conforme_at"
    | "partner_resent_at"
    | "client_notified_at"
    | "pipe_timeline_entry_id"
    | "status"
  >,
  column: PlacementBoardColumn
): { prefix: string; formatted: string } | null {
  const ts = pickPlacementBoardCardTimestamp(operation, column);
  if (ts == null) return null;
  return {
    prefix: placementBoardCardDatePrefix(operation, column),
    formatted: formatPlacementBoardDateTime(ts),
  };
}

const PLACEMENT_BOARD_DATE_TZ = "Europe/Paris";

export function formatPlacementBoardDateTime(unix: number): string {
  return new Date(unix * 1000).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PLACEMENT_BOARD_DATE_TZ,
  });
}

function placementBoardCardDatePrefix(
  operation: Pick<PlacementOperation, "status" | "client_notified_at">,
  column: PlacementBoardColumn
): string {
  switch (column) {
    case "declare":
      return "Créé le";
    case "waiting":
      return "Envoyé le";
    case "first_response":
      return operation.status === "NON_CONFORME" ? "Non conforme le" : "Réponse le";
    case "conforme_after_nc":
      return "Renvoyé le";
    case "partner_fin":
      return "Validé le";
    case "client_mail":
      return boardTs(operation.client_notified_at) ? "Mail client le" : "Conforme le";
    default:
      return "Le";
  }
}

function pickPlacementBoardCardTimestamp(
  operation: Pick<
    PlacementOperation,
    | "created_at"
    | "updated_at"
    | "email_received_at"
    | "non_conforme_at"
    | "partner_resent_at"
    | "client_notified_at"
    | "pipe_timeline_entry_id"
    | "status"
  >,
  column: PlacementBoardColumn
): number | null {
  switch (column) {
    case "declare":
      return boardTimestamp(operation.created_at);
    case "waiting":
      return boardTimestamp(operation.updated_at);
    case "first_response":
      if (operation.status === "NON_CONFORME") {
        return boardTimestamp(operation.non_conforme_at) ?? boardTimestamp(operation.email_received_at);
      }
      return boardTimestamp(operation.email_received_at);
    case "conforme_after_nc":
      return (
        boardTimestamp(operation.partner_resent_at) ?? boardTimestamp(operation.email_received_at)
      );
    case "partner_fin":
      return boardTimestamp(operation.email_received_at);
    case "client_mail":
      return (
        boardTimestamp(operation.client_notified_at) ?? boardTimestamp(operation.email_received_at)
      );
    default:
      return boardTimestamp(operation.updated_at);
  }
}

export function formatPlacementBoardActeLabel(
  operation: Pick<PlacementOperation, "stellium_label" | "product_label" | "operation_type">
): string {
  const acte = operation.stellium_label?.trim();
  const produit = formatStelliumProductForDisplay(operation.product_label?.trim() ?? "");
  if (acte && produit) return `${acte} · ${produit}`;
  return acte || produit || operation.operation_type;
}

export function placementBoardRowShowsUndeclaredBadge(
  operation: Pick<PlacementOperation, "status" | "pipe_timeline_entry_id" | "email_received_at" | "pipe_id">
): boolean {
  return placementBoardRowBadge(operation) != null;
}

function boardTs(value: number | null | undefined): boolean {
  return value != null && value > 0;
}

function boardTimestamp(value: number | null | undefined): number | null {
  return boardTs(value) ? value! : null;
}

/** Alerte rouge : mail Stellium non conforme, en attente d'action CGP. */
export function placementBoardRowShowsNonConformeAlert(
  operation: Pick<PlacementOperation, "status" | "partner_resent_at">
): boolean {
  return operation.status === "NON_CONFORME" && !boardTs(operation.partner_resent_at);
}
