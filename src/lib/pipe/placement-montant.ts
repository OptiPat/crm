import { isVersementComplementaireActLabel } from "@/lib/pipe/pipe-suivi";

export function placementOperationRequiresMontant(options: {
  operationType: string;
  stelliumLabel?: string | null;
  pipeType?: string | null;
}): boolean {
  const op = options.operationType.trim().toUpperCase();
  const label = options.stelliumLabel?.trim() ?? "";
  const pipeType = options.pipeType?.trim() ?? "";

  if (op === "SOUSCRIPTION" && pipeType === "AFFAIRE") return true;

  if (op === "VERSEMENT") {
    if (pipeType === "AFFAIRE") return true;
    if (pipeType === "ACTE_GESTION" && isVersementComplementaireActLabel(label)) {
      return true;
    }
  }

  return false;
}

export function parseMontantEurosToCentimes(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function formatMontantCentimesInput(centimes: number | null | undefined): string {
  if (centimes == null || !Number.isFinite(centimes) || centimes <= 0) return "";
  const euros = centimes / 100;
  return Number.isInteger(euros) ? String(euros) : euros.toFixed(2).replace(".", ",");
}
