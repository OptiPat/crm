import type { ExtractedData } from "@/lib/pdf";
import { isImmobilierFinancingType } from "@/lib/investissements/investissement-immo-financing";
import { extractPatrimoineItemsFromRio } from "./extract-patrimoine-items";

export type RioPatrimoineCategory = "immobilier" | "placements" | "epargne";

export type RioImportStep = 1 | 2 | 3;

export function categorizePatrimoineType(type: string): RioPatrimoineCategory {
  if (isImmobilierFinancingType(type) || type === "RS") return "immobilier";
  if (["EPARGNE_BANCAIRE", "LIVRET_A", "LDDS", "PEL", "CEL"].includes(type)) return "epargne";
  return "placements";
}

export function hasStructuredRioPatrimoine(data: ExtractedData): boolean {
  return Boolean(
    (data.contratsFinanciers && data.contratsFinanciers.length > 0) ||
      (data.biensImmobiliers && data.biensImmobiliers.length > 0)
  );
}

export function isGuidedStelliumPreview(typeDocument?: string): boolean {
  return typeDocument === "RIO" || typeDocument === "QPI";
}

export interface RioPreviewSummary {
  contactLabel: string;
  typeDocument: string;
  patrimoineBrut?: number;
  patrimoineNet?: number;
  revenusTotal?: number;
  chargesTotal?: number;
  sri?: number;
  itemsToTri: number;
  itemsAutoCote: number;
  isCouple: boolean;
  hasPatrimoineStep: boolean;
}

export function buildRioPreviewSummary(data: ExtractedData): RioPreviewSummary {
  const items = extractPatrimoineItemsFromRio(data);
  const toTri = items.filter((item) => !item.autoOrigine);
  const autoCote = items.filter((item) => item.autoOrigine === "EXISTANT_CLIENT");

  const prenom = data.prenom?.trim() ?? "";
  const nom = data.nom?.trim() ?? "";
  const contactLabel = [prenom, nom].filter(Boolean).join(" ") || "Contact";

  const hasPatrimoineStep =
    data.typeDocument === "RIO" &&
    items.some(
      (item) =>
        item.montant > 0 &&
        !["EPARGNE_BANCAIRE", "LIVRET_A", "LDDS", "PEL", "CEL"].includes(item.type)
    );

  return {
    contactLabel,
    typeDocument: data.typeDocument ?? "RIO",
    patrimoineBrut: data.patrimoineTotal,
    patrimoineNet: data.patrimoineNet,
    revenusTotal: data.revenusTotal,
    chargesTotal: data.chargesTotal,
    sri: data.profilRisque,
    itemsToTri: toTri.length,
    itemsAutoCote: autoCote.length,
    isCouple: Boolean(data.isCouple),
    hasPatrimoineStep,
  };
}

export function formatEuroCompact(value?: number): string {
  if (value == null || value <= 0) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
