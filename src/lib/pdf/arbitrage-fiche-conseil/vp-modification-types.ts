import { parseMontantEurosToCentimes } from "@/lib/pipe/placement-montant";

export const VP_MODIFICATION_KINDS = ["montant", "allocation", "periodicite"] as const;
export type VpModificationKind = (typeof VP_MODIFICATION_KINDS)[number];

export type VpModificationActValue = {
  kinds: VpModificationKind[];
  montantEuros: string;
  frequence: string;
};

export const EMPTY_VP_MODIFICATION_ACT_VALUE: VpModificationActValue = {
  kinds: [],
  montantEuros: "",
  frequence: "MENSUEL",
};

export function isVpModificationKind(value: string): value is VpModificationKind {
  return (VP_MODIFICATION_KINDS as readonly string[]).includes(value);
}

export function toggleVpModificationKind(
  kinds: readonly VpModificationKind[],
  kind: VpModificationKind,
  checked: boolean
): VpModificationKind[] {
  if (checked) {
    return kinds.includes(kind) ? [...kinds] : [...kinds, kind];
  }
  return kinds.filter((item) => item !== kind);
}

export type VpModificationPdfFillInput = {
  kinds: VpModificationKind[];
  montantCentimes?: number | null;
  /** Fréquence CRM : MENSUEL, TRIMESTRIEL, SEMESTRIEL, ANNUEL */
  frequence?: string | null;
};

export function vpModificationMontantCentimesFromAct(
  value: VpModificationActValue | undefined
): number | null {
  if (!value?.kinds.includes("montant")) return null;
  return parseMontantEurosToCentimes(value.montantEuros);
}

export function toVpModificationPdfFillInput(
  value: VpModificationActValue
): VpModificationPdfFillInput | undefined {
  if (value.kinds.length === 0) return undefined;
  return {
    kinds: value.kinds,
    montantCentimes: vpModificationMontantCentimesFromAct(value),
    frequence: value.kinds.includes("periodicite") ? value.frequence || null : null,
  };
}
