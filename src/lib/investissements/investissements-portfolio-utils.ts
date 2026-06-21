import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import { compareContactsAlphabetically } from "@/lib/contacts/contact-sort";
import { formatNomProduit } from "@/lib/investissements/investissement-display";
import {
  getEffectiveEncoursCentimes,
  isPlacementEncoursEligible,
} from "@/lib/investissements/investissement-encours";
import { compareInvestissementsScpiCreditFirst } from "@/lib/investissements/investissement-scpi-reinvest";
import { groupPatrimoineByCategory } from "@/lib/investissements/patrimoine-tab-utils";

export type InvestissementPortfolioSort =
  | "date_desc"
  | "montant_desc"
  | "encours_desc"
  | "client_asc"
  | "demembrement_asc";

export type InvestissementPortfolioGroup =
  | "category"
  | "client"
  | "partenaire"
  | "type"
  | "flat";

export const INVESTISSEMENT_PORTFOLIO_SORT_LABELS: Record<
  InvestissementPortfolioSort,
  string
> = {
  client_asc: "Nom de famille — A → Z",
  date_desc: "Souscription — plus récent",
  montant_desc: "Montant souscrit — décroissant",
  encours_desc: "Encours — décroissant",
  demembrement_asc: "Fin démembrement — proche",
};

export const INVESTISSEMENT_PORTFOLIO_GROUP_LABELS: Record<
  InvestissementPortfolioGroup,
  string
> = {
  category: "Par catégorie (immo / financier)",
  client: "Client ou foyer",
  partenaire: "Partenaire",
  type: "Type de produit",
  flat: "Liste unique",
};

/** Montant affiché dans les totaux portefeuille (encours si éligible, sinon souscrit). */
export function getPatrimoineLineAmountCentimes(
  inv: Pick<
    InvestissementWithDetails,
    "type_produit" | "encours_actuel" | "montant_initial"
  >
): number {
  if (isPlacementEncoursEligible(inv.type_produit)) {
    return getEffectiveEncoursCentimes(inv);
  }
  return inv.montant_initial ?? 0;
}

export function sumPatrimoineLineAmountCentimes(
  items: Pick<
    InvestissementWithDetails,
    "type_produit" | "encours_actuel" | "montant_initial"
  >[]
): number {
  return items.reduce((s, inv) => s + getPatrimoineLineAmountCentimes(inv), 0);
}

export function sumMontantInitialCentimes(
  items: Pick<InvestissementWithDetails, "montant_initial">[]
): number {
  return items.reduce((s, inv) => s + (inv.montant_initial ?? 0), 0);
}

export function getInvestissementOwnerLabel(inv: InvestissementWithDetails): string {
  if (inv.foyer_nom?.trim()) return inv.foyer_nom.trim();
  const name = [inv.contact_prenom, inv.contact_nom].filter(Boolean).join(" ").trim();
  return name || "Sans détenteur";
}

/** Identité de tri : nom de famille d'abord (foyer commun → libellé du foyer). */
export function getInvestissementOwnerSortIdentity(
  inv: Pick<
    InvestissementWithDetails,
    "contact_id" | "contact_nom" | "contact_prenom" | "foyer_id" | "foyer_nom"
  >
): { nom: string; prenom: string } {
  const isFoyerOnly =
    inv.foyer_id != null &&
    (inv.contact_id == null || inv.contact_prenom.trim() === "Foyer");
  if (isFoyerOnly) {
    return { nom: (inv.foyer_nom ?? inv.contact_nom ?? "").trim(), prenom: "" };
  }
  return { nom: inv.contact_nom.trim(), prenom: inv.contact_prenom.trim() };
}

export function compareInvestissementsByOwnerSurname(
  a: InvestissementWithDetails,
  b: InvestissementWithDetails
): number {
  return compareContactsAlphabetically(
    getInvestissementOwnerSortIdentity(a),
    getInvestissementOwnerSortIdentity(b)
  );
}

/** Clé stable de regroupement (évite fusion de homonymes). */
export function getInvestissementOwnerGroupKey(inv: InvestissementWithDetails): string {
  if (inv.foyer_id != null && inv.foyer_id > 0) {
    return `foyer:${inv.foyer_id}`;
  }
  if (inv.contact_id != null && inv.contact_id > 0) {
    return `contact:${inv.contact_id}`;
  }
  return `orphan:${inv.id}`;
}

function compareNullableNumberDesc(a: number | undefined, b: number | undefined): number {
  const av = a ?? 0;
  const bv = b ?? 0;
  if (av === 0 && bv === 0) return 0;
  if (av === 0) return 1;
  if (bv === 0) return -1;
  return bv - av;
}

export function compareInvestissementsPortfolio(
  a: InvestissementWithDetails,
  b: InvestissementWithDetails,
  sort: InvestissementPortfolioSort
): number {
  switch (sort) {
    case "montant_desc":
      return compareNullableNumberDesc(a.montant_initial, b.montant_initial);
    case "encours_desc":
      return compareNullableNumberDesc(
        getPatrimoineLineAmountCentimes(a),
        getPatrimoineLineAmountCentimes(b)
      );
    case "client_asc":
      return compareInvestissementsByOwnerSurname(a, b);
    case "demembrement_asc": {
      const ad = a.date_fin_demembrement;
      const bd = b.date_fin_demembrement;
      if (ad == null && bd == null) return 0;
      if (ad == null) return 1;
      if (bd == null) return -1;
      return ad - bd;
    }
    case "date_desc":
    default:
      return compareNullableNumberDesc(a.date_souscription, b.date_souscription);
  }
}

export function sortInvestissementsPortfolio(
  items: InvestissementWithDetails[],
  sort: InvestissementPortfolioSort,
  options?: { scpiCreditFirst?: boolean }
): InvestissementWithDetails[] {
  const sorted = [...items].sort((a, b) => {
    if (options?.scpiCreditFirst) {
      const creditOrder = compareInvestissementsScpiCreditFirst(a, b);
      if (creditOrder !== 0) return creditOrder;
    }
    const primary = compareInvestissementsPortfolio(a, b, sort);
    if (primary !== 0) return primary;
    const bySurname = compareInvestissementsByOwnerSurname(a, b);
    if (bySurname !== 0) return bySurname;
    return compareInvestissementsPortfolio(a, b, "date_desc");
  });
  return sorted;
}

export type PortfolioDisplayGroup = {
  key: string;
  label: string;
  items: InvestissementWithDetails[];
};

export function groupInvestissementsPortfolio(
  items: InvestissementWithDetails[],
  mode: InvestissementPortfolioGroup
): PortfolioDisplayGroup[] {
  if (items.length === 0) return [];

  if (mode === "flat") {
    return [{ key: "all", label: "Tous les placements", items }];
  }

  if (mode === "category") {
    const { immobilier, financier } = groupPatrimoineByCategory(items, {
      preserveOrder: true,
    });
    const groups: PortfolioDisplayGroup[] = [];
    if (immobilier.length > 0) {
      groups.push({
        key: "immo",
        label: "Immobilier",
        items: immobilier as InvestissementWithDetails[],
      });
    }
    if (financier.length > 0) {
      groups.push({
        key: "fin",
        label: "Placements financiers",
        items: financier as InvestissementWithDetails[],
      });
    }
    return groups;
  }

  const bucketKey = (inv: InvestissementWithDetails): string => {
    switch (mode) {
      case "client":
        return getInvestissementOwnerGroupKey(inv);
      case "partenaire":
        if (inv.partenaire_id != null && inv.partenaire_id > 0) {
          return `partenaire:${inv.partenaire_id}`;
        }
        return `partenaire-name:${inv.partenaire_nom?.trim() || "Sans partenaire"}`;
      case "type":
        return inv.type_produit || "AUTRE";
      default:
        return "all";
    }
  };

  const bucketLabel = (key: string, sample?: InvestissementWithDetails): string => {
    if (mode === "client" && sample) {
      return getInvestissementOwnerLabel(sample);
    }
    if (mode === "partenaire" && sample?.partenaire_nom?.trim()) {
      return sample.partenaire_nom.trim();
    }
    if (mode === "type") {
      return formatNomProduit(key);
    }
    if (mode === "partenaire" && key.startsWith("partenaire-name:")) {
      return key.slice("partenaire-name:".length);
    }
    return key;
  };

  const map = new Map<string, InvestissementWithDetails[]>();
  for (const inv of items) {
    const key = bucketKey(inv);
    const list = map.get(key) ?? [];
    list.push(inv);
    map.set(key, list);
  }

  return Array.from(map.entries())
    .map(([key, groupItems]) => ({
      key,
      label: bucketLabel(key, groupItems[0]),
      items: groupItems,
    }))
    .sort((a, b) => {
      if (mode === "client") {
        return compareInvestissementsByOwnerSurname(a.items[0], b.items[0]);
      }
      const totalA = sumPatrimoineLineAmountCentimes(a.items);
      const totalB = sumPatrimoineLineAmountCentimes(b.items);
      if (totalB !== totalA) return totalB - totalA;
      return compareInvestissementsByOwnerSurname(a.items[0], b.items[0]);
    });
}
