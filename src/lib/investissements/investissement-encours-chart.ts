import type { InvestissementVersement } from "@/lib/api/tauri-investissement-versements";
import type { InvestissementValorisation } from "@/lib/api/tauri-investissement-valorisations";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";

export type EncoursChartPointKind = "souscription" | "valorisation" | "complement";

export interface EncoursChartPoint {
  key: string;
  label: string;
  dateTs: number;
  /** Encours cumulé à cette date (euros). */
  encours: number;
  /** Montant du complément (euros) — barre sur le graphique. */
  complementBar: number;
  kind: EncoursChartPointKind;
}

type TimelineEvent =
  | { kind: "souscription"; ts: number; montant: number }
  | { kind: "complement"; ts: number; montant: number; id: number }
  | { kind: "valorisation"; ts: number; montant: number; id: number };

const KIND_ORDER: Record<TimelineEvent["kind"], number> = {
  souscription: 0,
  complement: 1,
  valorisation: 2,
};

function sortEvents(a: TimelineEvent, b: TimelineEvent): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}

/** Construit la courbe d'encours + barres de versements complémentaires. */
export function buildEncoursChartPoints(
  montantInitial?: number,
  dateSouscription?: number,
  valorisations: InvestissementValorisation[] = [],
  versements: InvestissementVersement[] = []
): EncoursChartPoint[] {
  const events: TimelineEvent[] = [];

  if (montantInitial != null && montantInitial > 0 && dateSouscription) {
    events.push({
      kind: "souscription",
      ts: dateSouscription,
      montant: montantInitial,
    });
  }
  for (const v of versements) {
    events.push({
      kind: "complement",
      ts: v.date_versement,
      montant: v.montant,
      id: v.id,
    });
  }
  for (const v of valorisations) {
    events.push({
      kind: "valorisation",
      ts: v.date_valorisation,
      montant: v.montant,
      id: v.id,
    });
  }

  if (events.length === 0) return [];

  events.sort(sortEvents);

  const initial = montantInitial ?? 0;
  let lastValorisation: { ts: number; montant: number } | null = null;
  let complementsSinceValorisation = 0;

  const points: EncoursChartPoint[] = [];

  for (const event of events) {
    if (event.kind === "valorisation") {
      lastValorisation = { ts: event.ts, montant: event.montant };
      complementsSinceValorisation = 0;
      points.push({
        key: `val-${event.id}`,
        label: formatCalendarDateFr(event.ts),
        dateTs: event.ts,
        encours: event.montant / 100,
        complementBar: 0,
        kind: "valorisation",
      });
      continue;
    }

    if (event.kind === "souscription") {
      complementsSinceValorisation = 0;
      points.push({
        key: `sub-${event.ts}`,
        label: formatCalendarDateFr(event.ts),
        dateTs: event.ts,
        encours: event.montant / 100,
        complementBar: 0,
        kind: "souscription",
      });
      continue;
    }

    complementsSinceValorisation += event.montant;
    const base = lastValorisation?.montant ?? initial;
    const encoursCentimes = base + complementsSinceValorisation;

    points.push({
      key: `vc-${event.id}`,
      label: formatCalendarDateFr(event.ts),
      dateTs: event.ts,
      encours: encoursCentimes / 100,
      complementBar: event.montant / 100,
      kind: "complement",
    });
  }

  return points;
}
