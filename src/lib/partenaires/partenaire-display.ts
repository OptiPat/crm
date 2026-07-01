import type { LucideIcon } from "lucide-react";
import { Building2, Home, Shield } from "lucide-react";

export type PartenaireTypeInfo = {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
  accentClass: string;
};

export function getPartenaireTypeInfo(type: string): PartenaireTypeInfo {
  switch (type) {
    case "SOCIETE_GESTION_SCPI":
    case "SOCIETE_GESTION":
      return {
        label: "Société de gestion SCPI",
        icon: Building2,
        badgeClass: "bg-blue-100 text-blue-800 border-blue-200/80",
        accentClass: "from-blue-500/15 to-blue-600/5 border-blue-500/20",
      };
    case "SOCIETE_GESTION_FIP":
      return {
        label: "Société de gestion FIP/FCPI/FCPR",
        icon: Building2,
        badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200/80",
        accentClass: "from-indigo-500/15 to-indigo-600/5 border-indigo-500/20",
      };
    case "ASSUREUR":
      return {
        label: "Assureur",
        icon: Shield,
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200/80",
        accentClass: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20",
      };
    case "PROMOTEUR":
      return {
        label: "Promoteur",
        icon: Home,
        badgeClass: "bg-orange-100 text-orange-800 border-orange-200/80",
        accentClass: "from-orange-500/15 to-orange-600/5 border-orange-500/20",
      };
    default: {
      const cleanLabel = type
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        label: cleanLabel,
        icon: Building2,
        badgeClass: "bg-muted text-muted-foreground border-border",
        accentClass: "from-muted/40 to-muted/20 border-border",
      };
    }
  }
}

export const PARTENAIRE_TYPE_FILTER_OPTIONS = [
  { value: "ALL", label: "Tous les types" },
  { value: "SOCIETE_GESTION_SCPI", label: "SCPI" },
  { value: "SOCIETE_GESTION_FIP", label: "FIP / FCPI / FCPR" },
  { value: "ASSUREUR", label: "Assureurs" },
  { value: "PROMOTEUR", label: "Promoteurs" },
] as const;

const ASSUREUR_PRODUIT_TYPES = new Set([
  "ASSURANCE_VIE",
  "PER",
  "CONTRAT_CAPITALISATION",
  "EPARGNE_SALARIALE",
]);

const FIP_PRODUIT_TYPES = new Set(["FIP_FCPI", "FCPR", "G3F"]);

const SCPI_PRODUIT_TYPES = new Set(["SCPI", "SCPI_DEMEMBREMENT", "SCPI_FISCALE"]);

const IMMO_PRODUIT_TYPES = new Set([
  "IMMOBILIER",
  "PINEL",
  "DENORMANDIE",
  "JEANBRUN",
  "MALRAUX",
  "MONUMENT_HISTORIQUE",
  "DEFICIT_FONCIER",
  "LMNP",
  "LMP",
  "NUE_PROPRIETE",
  "RESIDENCE_PRINCIPALE",
  "LOCATIF_CLASSIQUE",
  "LOCATIF",
]);

/** Type partenaire suggéré lors de la création depuis un placement. */
export function suggestPartenaireTypeForProduit(typeProduit: string): string {
  if (ASSUREUR_PRODUIT_TYPES.has(typeProduit)) return "ASSUREUR";
  if (FIP_PRODUIT_TYPES.has(typeProduit)) return "SOCIETE_GESTION_FIP";
  if (SCPI_PRODUIT_TYPES.has(typeProduit)) return "SOCIETE_GESTION_SCPI";
  if (IMMO_PRODUIT_TYPES.has(typeProduit)) return "PROMOTEUR";
  return "SOCIETE_GESTION_SCPI";
}
