import type { TachePriorite, TacheStatut } from "@/lib/api/tauri-taches";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";

export const PRIORITE_META: Record<
  TachePriorite,
  { label: string; className: string }
> = {
  HAUTE: { label: "Haute", className: "bg-red-100 text-red-700" },
  NORMALE: { label: "Normale", className: "bg-slate-100 text-slate-600" },
  BASSE: { label: "Basse", className: "bg-slate-100 text-slate-400" },
};

export type EcheanceState =
  | "none"
  | "overdue"
  | "today"
  | "tomorrow"
  | "upcoming";

/** Début du jour UTC (aligné sur le stockage des échéances) en secondes. */
function startOfTodayUnix(nowMs: number): number {
  const d = new Date(nowMs);
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000
  );
}

/** Position d'une échéance par rapport à aujourd'hui (tâche non faite). */
export function echeanceState(
  dateEcheance: number | null | undefined,
  statut: TacheStatut,
  nowMs: number = Date.now()
): EcheanceState {
  if (dateEcheance == null || statut === "FAIT") return "none";
  const today = startOfTodayUnix(nowMs);
  const oneDay = 86400;
  if (dateEcheance < today) return "overdue";
  if (dateEcheance < today + oneDay) return "today";
  if (dateEcheance < today + 2 * oneDay) return "tomorrow";
  return "upcoming";
}

/** Libellé court d'échéance pour l'UI. */
export function echeanceLabel(
  dateEcheance: number | null | undefined,
  statut: TacheStatut,
  nowMs: number = Date.now()
): string {
  if (dateEcheance == null) return "Sans date";
  const state = echeanceState(dateEcheance, statut, nowMs);
  switch (state) {
    case "overdue":
      return `En retard · ${formatCalendarDateFr(dateEcheance)}`;
    case "today":
      return "Aujourd'hui";
    case "tomorrow":
      return "Demain";
    default:
      return formatCalendarDateFr(dateEcheance);
  }
}

export const ECHEANCE_TONE_CLASS: Record<EcheanceState, string> = {
  overdue: "text-red-600 font-medium",
  today: "text-amber-600 font-medium",
  tomorrow: "text-amber-600",
  upcoming: "text-muted-foreground",
  none: "text-muted-foreground",
};
