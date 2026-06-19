import type { ExtractedData } from "@/lib/pdf";
import { extractPatrimoineItemsFromRio } from "./extract-patrimoine-items";

export type RioPreviewTab = "contact" | "revenus" | "patrimoine" | "objectifs" | "profil";

export type RioTabStatus = "ok" | "warn" | "empty";

const CONTACT_FIELDS = new Set(["nom", "prénom", "email", "téléphone"]);
const REVENUS_FIELDS = new Set(["revenus"]);
const PATRIMOINE_FIELDS = new Set(["patrimoine", "détail patrimoine"]);

/** Associe un libellé manquant (guard) à l'onglet wizard. */
export function missingFieldToTab(field: string): RioPreviewTab | null {
  if (CONTACT_FIELDS.has(field)) return "contact";
  if (REVENUS_FIELDS.has(field)) return "revenus";
  if (PATRIMOINE_FIELDS.has(field)) return "patrimoine";
  return null;
}

function hasContactData(data: ExtractedData): boolean {
  return Boolean(
    data.nom?.trim() ||
      data.prenom?.trim() ||
      data.email?.trim() ||
      data.telephone?.trim()
  );
}

function hasRevenusData(data: ExtractedData): boolean {
  return (
    (data.revenusTotal ?? 0) > 0 ||
    (data.revenusSalaires ?? 0) > 0 ||
    (data.chargesTotal ?? 0) > 0
  );
}

function hasPatrimoineData(data: ExtractedData): boolean {
  return (
    (data.patrimoineTotal ?? 0) > 0 ||
    (data.biensImmobiliers?.length ?? 0) > 0 ||
    (data.contratsFinanciers?.length ?? 0) > 0
  );
}

export function assessRioPreviewTabStatus(
  data: ExtractedData,
  tab: RioPreviewTab,
  missingFields: readonly string[] = []
): RioTabStatus {
  const missingOnTab = missingFields.some((f) => missingFieldToTab(f) === tab);

  switch (tab) {
    case "contact":
      if (missingOnTab || !hasContactData(data)) return missingOnTab ? "warn" : "empty";
      return "ok";
    case "revenus":
      if (missingOnTab) return "warn";
      return hasRevenusData(data) ? "ok" : "empty";
    case "patrimoine":
      if (missingOnTab) return "warn";
      if (!hasPatrimoineData(data)) return "empty";
      if (patrimoineCoherenceGap(data) != null) return "warn";
      return "ok";
    case "objectifs":
      return (data.objectifsPrincipaux?.length ?? 0) > 0 ? "ok" : "empty";
    case "profil":
      return data.profilRisque != null && data.profilRisque > 0 ? "ok" : "warn";
    default:
      return "empty";
  }
}

/** Somme des lignes patrimoine détectées (hors épargne auto « à côté »). */
export function computePatrimoineLinesSum(data: ExtractedData): number {
  return extractPatrimoineItemsFromRio(data).reduce((sum, item) => sum + item.montant, 0);
}

/** Écart € entre patrimoine brut RIO et somme des lignes, ou null si non calculable. */
export function patrimoineCoherenceGap(data: ExtractedData): number | null {
  const brut = data.patrimoineTotal;
  if (brut == null || brut <= 0) return null;
  const linesSum = computePatrimoineLinesSum(data);
  if (linesSum <= 0) return null;
  const gap = Math.abs(brut - linesSum);
  return gap > Math.max(500, brut * 0.05) ? brut - linesSum : null;
}

export function formatPatrimoineCoherenceMessage(gap: number): string {
  const formatted = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.abs(gap));
  return gap > 0
    ? `Écart de ${formatted} entre le patrimoine brut RIO et la somme des lignes détectées — vérifiez les biens et contrats.`
    : `La somme des lignes dépasse le patrimoine brut RIO de ${formatted} — vérifiez les montants.`;
}
