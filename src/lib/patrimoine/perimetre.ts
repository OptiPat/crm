import type { OrigineInvestissement } from "@/lib/api/tauri-investissements";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";

export interface PerimetreLigne {
  origine: OrigineInvestissement | string;
  encours_actuel?: number | null;
  montant_initial?: number | null;
  encours_date?: number | null;
  derniere_maj_client?: number | null;
}

export interface PatrimoineSourceSlice {
  origine: "MON_CONSEIL" | "EXISTANT_CLIENT" | "DECLARE_CLIENT";
  centimes: number;
  /** Date de référence la plus récente pour cette source. */
  referenceDate?: number;
  label: string;
}

export interface PerimetrePatrimoine {
  slices: PatrimoineSourceSlice[];
  totalCentimes: number;
  /** Part déclarée par le client / non vérifiée (0–1). */
  partDeclaree: number;
  completenessLabel: string;
}

const SOURCE_LABELS: Record<string, string> = {
  MON_CONSEIL: "Investis avec votre conseiller",
  EXISTANT_CLIENT: "Déjà en place",
  DECLARE_CLIENT: "Déclaré par vous",
};

export interface BuildPerimetrePatrimoineOptions {
  /** Dernier contact client — date de référence pour l'origine EXISTANT_CLIENT. */
  dateDernierContact?: number | null;
}

function referenceDateForLine(
  line: PerimetreLigne,
  options?: BuildPerimetrePatrimoineOptions
): number | undefined {
  if (line.origine === "DECLARE_CLIENT") {
    return line.derniere_maj_client ?? undefined;
  }
  if (line.origine === "EXISTANT_CLIENT") {
    return options?.dateDernierContact ?? undefined;
  }
  return line.encours_date ?? undefined;
}

/** R1 — Décomposition du total par source, sans agrégat opaque. */
export function buildPerimetrePatrimoine(
  lignes: PerimetreLigne[],
  options?: BuildPerimetrePatrimoineOptions
): PerimetrePatrimoine {
  const buckets = new Map<string, { centimes: number; referenceDate?: number }>();

  for (const line of lignes) {
    const amount = getEffectiveEncoursCentimes({
      encours_actuel: line.encours_actuel ?? undefined,
      montant_initial: line.montant_initial ?? undefined,
    });
    if (amount <= 0) continue;
    const key = line.origine || "MON_CONSEIL";
    const prev = buckets.get(key) ?? { centimes: 0, referenceDate: undefined };
    const ref = referenceDateForLine(line, options);
    buckets.set(key, {
      centimes: prev.centimes + amount,
      referenceDate:
        ref != null && (prev.referenceDate == null || ref > prev.referenceDate)
          ? ref
          : prev.referenceDate,
    });
  }

  const order: Array<"MON_CONSEIL" | "EXISTANT_CLIENT" | "DECLARE_CLIENT"> = [
    "MON_CONSEIL",
    "EXISTANT_CLIENT",
    "DECLARE_CLIENT",
  ];

  const slices: PatrimoineSourceSlice[] = [];
  for (const origine of order) {
    const bucket = buckets.get(origine);
    if (!bucket || bucket.centimes <= 0) continue;
    slices.push({
      origine,
      centimes: bucket.centimes,
      referenceDate: bucket.referenceDate,
      label: SOURCE_LABELS[origine] ?? origine,
    });
  }

  const totalCentimes = slices.reduce((s, x) => s + x.centimes, 0);
  const declareCentimes =
    buckets.get("DECLARE_CLIENT")?.centimes ?? 0;
  const partDeclaree =
    totalCentimes > 0 ? declareCentimes / totalCentimes : 0;

  return {
    slices,
    totalCentimes,
    partDeclaree,
    completenessLabel: "Synthèse à partir des informations connues à ce jour",
  };
}

export function formatPerimetreSliceLine(slice: PatrimoineSourceSlice): string {
  const euros = Math.round(slice.centimes / 100);
  const formatted = new Intl.NumberFormat("fr-FR").format(euros);
  if (slice.referenceDate) {
    const d = new Date(slice.referenceDate * 1000);
    const dateStr = d.toLocaleDateString("fr-FR");
    return `${formatted} € ${slice.label.toLowerCase()} au ${dateStr}`;
  }
  return `${formatted} € ${slice.label.toLowerCase()}`;
}
