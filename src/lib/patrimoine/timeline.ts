import type { Alerte } from "@/lib/api/tauri-alertes";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Tache } from "@/lib/api/tauri-taches";
import { formatNomProduit } from "@/lib/investissements/investissement-display";

export type PatrimoineTimelineKind =
  | "fin_demembrement"
  | "fin_pret"
  | "prochain_arbitrage"
  | "cloture"
  | "alerte"
  | "tache";

export interface PatrimoineTimelineEvent {
  id: string;
  kind: PatrimoineTimelineKind;
  date: number;
  label: string;
  detail?: string;
  /** Placement lié — couleur alignée sur l'inventaire client. */
  type_produit?: string;
  origine?: string;
}

const ALERTE_CLIENT_LABELS: Record<string, string> = {
  FIN_DEMEMBREMENT: "Fin de démembrement",
  SUIVI_CLIENT_ANNUEL: "Déclaration fiscale",
  SUIVI_CLIENT_1AN: "Suivi annuel",
  ANNIVERSAIRE: "Anniversaire",
  ARBITRAGE_AV_PER: "Arbitrage à prévoir",
};

function pushInvestissementDate(
  events: PatrimoineTimelineEvent[],
  inv: Investissement,
  field: keyof Pick<
    Investissement,
    | "date_fin_demembrement"
    | "date_fin_pret"
    | "date_prochain_arbitrage"
    | "date_cloture"
  >,
  kind: PatrimoineTimelineKind,
  labelPrefix: string
) {
  const date = inv[field];
  if (date == null || date <= 0) return;
  const produit = formatNomProduit(inv.type_produit) || inv.nom_produit;
  events.push({
    id: `inv-${inv.id}-${String(field)}`,
    kind,
    date,
    label: `${labelPrefix} — ${produit}`,
    detail: inv.nom_produit,
    type_produit: inv.type_produit,
    origine: inv.origine,
  });
}

export function buildPatrimoineTimeline(
  investissements: Investissement[],
  alertes: Alerte[] = [],
  taches: Tache[] = [],
  options?: { fromUnix?: number; includePast?: boolean }
): PatrimoineTimelineEvent[] {
  const events: PatrimoineTimelineEvent[] = [];

  for (const inv of investissements) {
    if (inv.statut === "CLOTURE") continue;
    pushInvestissementDate(
      events,
      inv,
      "date_fin_demembrement",
      "fin_demembrement",
      "Fin de démembrement"
    );
    pushInvestissementDate(events, inv, "date_fin_pret", "fin_pret", "Fin de prêt");
  }

  for (const alerte of alertes) {
    if (alerte.traitee) continue;
    const typeLabel =
      ALERTE_CLIENT_LABELS[alerte.type_alerte] ?? "Échéance à prévoir";
    events.push({
      id: `alerte-${alerte.id}`,
      kind: "alerte",
      date: alerte.date_alerte,
      label: typeLabel,
      detail: alerte.message,
    });
  }

  for (const tache of taches) {
    if (tache.statut === "FAIT" || tache.date_echeance == null) continue;
    events.push({
      id: `tache-${tache.id}`,
      kind: "tache",
      date: tache.date_echeance,
      label: "Rendez-vous / tâche",
      detail: tache.titre,
    });
  }

  // La vue client annonce des échéances « à venir » : un démembrement clos en 2019
  // arriverait sinon en tête de liste, le tri étant croissant.
  const from = options?.fromUnix ?? Math.floor(Date.now() / 1000);
  const retained = options?.includePast
    ? events
    : events.filter((event) => event.date >= from);

  return retained.sort((a, b) => a.date - b.date);
}

/** Échéances réservées au conseiller — jamais affichées côté client. */
const CLIENT_HIDDEN_TIMELINE_KINDS = new Set<PatrimoineTimelineKind>([
  "prochain_arbitrage",
]);

export function filterPatrimoineTimelineForClient(
  events: PatrimoineTimelineEvent[]
): PatrimoineTimelineEvent[] {
  return events.filter((event) => !CLIENT_HIDDEN_TIMELINE_KINDS.has(event.kind));
}
