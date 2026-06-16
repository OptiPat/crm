import type { ExtractedData } from "@/lib/pdf";
import type { OrigineInvestissement } from "@/lib/api/tauri-investissements";

export interface PatrimoineExtractItem {
  id: string;
  type: string;
  label: string;
  montant: number;
  autoOrigine?: OrigineInvestissement;
  creditCRD?: number;
  mensualiteCredit?: number;
  loyerAnnuel?: number;
  dateFinCredit?: string;
}

function mapImmoTypeToProduct(type: string): string {
  if (type === "RESIDENCE_PRINCIPALE") return "RP";
  if (type === "RESIDENCE_SECONDAIRE") return "RS";
  if (type === "PINEL") return "PINEL";
  if (type === "LMNP") return "LMNP";
  if (type === "LMP") return "LMP";
  if (type === "LOCATIF" || type === "CLASSIQUE") return "LOCATIF";
  return "IMMOBILIER";
}

function pushFinancialFallbacks(data: ExtractedData, items: PatrimoineExtractItem[]): void {
  const fallbacks: Array<{ key: keyof ExtractedData; type: string; label: string; auto?: OrigineInvestissement }> = [
    { key: "assuranceVie", type: "ASSURANCE_VIE", label: "Assurance-vie" },
    { key: "per", type: "PER", label: "PER (Plan Épargne Retraite)" },
    { key: "scpi", type: "SCPI", label: "SCPI" },
    { key: "pea", type: "PEA", label: "PEA" },
    { key: "pel", type: "PEL", label: "PEL" },
    { key: "perp", type: "PERP", label: "PERP" },
    { key: "compteTitres", type: "COMPTE_TITRE", label: "Compte-titres" },
    { key: "actionsObligations", type: "AUTRE", label: "Actions / Obligations" },
    { key: "livretA", type: "LIVRET_A", label: "Livret A", auto: "EXISTANT_CLIENT" },
    { key: "ldd", type: "LDDS", label: "LDD", auto: "EXISTANT_CLIENT" },
    { key: "compteCourant", type: "EPARGNE_BANCAIRE", label: "Compte courant", auto: "EXISTANT_CLIENT" },
  ];

  for (const fb of fallbacks) {
    const value = data[fb.key];
    if (typeof value !== "number" || value <= 0) continue;
    if (items.some((i) => i.type === fb.type && i.label === fb.label)) continue;
    if (fb.type === "ASSURANCE_VIE" && items.some((i) => i.type === "ASSURANCE_VIE")) continue;
    if (fb.type === "PER" && items.some((i) => i.type === "PER")) continue;
    items.push({
      id: `fallback-${fb.type.toLowerCase()}`,
      type: fb.type,
      label: fb.label,
      montant: value,
      autoOrigine: fb.auto,
    });
  }
}

/** Extraction unifiée patrimoine RIO pour tri et comparaison. */
export function extractPatrimoineItemsFromRio(data: ExtractedData): PatrimoineExtractItem[] {
  const items: PatrimoineExtractItem[] = [];

  if (data.contratsFinanciers?.length) {
    for (const contrat of data.contratsFinanciers) {
      if (contrat.montant <= 0) continue;
      items.push({
        id: contrat.id,
        type: contrat.type,
        label: contrat.nom,
        montant: contrat.montant,
        autoOrigine: contrat.autoOrigine,
      });
    }
  }

  if (data.biensImmobiliers?.length) {
    for (const bien of data.biensImmobiliers) {
      if (!bien.valeur || bien.valeur <= 0) continue;
      items.push({
        id: bien.id,
        type: mapImmoTypeToProduct(bien.type || "IMMOBILIER"),
        label: bien.nom,
        montant: bien.valeur,
        creditCRD: bien.creditCRD,
        mensualiteCredit: bien.mensualiteCredit,
        loyerAnnuel: bien.loyersAnnuels,
        dateFinCredit: bien.dateFinCredit,
      });
    }
  } else {
    if (data.residencePrincipale?.valeur && data.residencePrincipale.valeur > 0) {
      items.push({
        id: "residence-principale",
        type: "RP",
        label: "Résidence principale",
        montant: data.residencePrincipale.valeur,
      });
    }
    if (data.residenceSecondaire?.valeur && data.residenceSecondaire.valeur > 0) {
      items.push({
        id: "residence-secondaire",
        type: "RS",
        label: "Résidence secondaire",
        montant: data.residenceSecondaire.valeur,
      });
    }
    if (data.immobilierLocatif?.valeur && data.immobilierLocatif.valeur > 0) {
      items.push({
        id: "immobilier-locatif",
        type: "LOCATIF",
        label: "Immobilier locatif",
        montant: data.immobilierLocatif.valeur,
      });
    }
  }

  if (!data.contratsFinanciers?.length) {
    pushFinancialFallbacks(data, items);
  }

  return items;
}

export function hasPatrimoineExtractItems(data: ExtractedData): boolean {
  return extractPatrimoineItemsFromRio(data).some(
    (item) => item.type !== "EPARGNE_BANCAIRE" && item.type !== "LIVRET_A" && item.type !== "LDDS"
      ? true
      : item.montant > 0
  );
}
