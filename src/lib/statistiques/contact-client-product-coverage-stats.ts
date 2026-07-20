import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { isPrescripteurCategorie } from "@/lib/contacts/contact-form-utils";
import { IMMOBILIER_TYPES } from "@/lib/investissements/investissement-display";
import type { StatistiquesPanelId } from "./statistiques-page-preferences";

export type ClientProductCoverageKind = "assurance_vie" | "scpi" | "per" | "immobilier";
export type ClientProductCoverageListKind = "withProduct" | "withoutProduct";

export type ClientProductCoverageStatResult = {
  totalCount: number;
  withProductCount: number;
  withProductPercent: number;
  withProductContactIds: number[];
  withoutProductContactIds: number[];
};

export type ClientProductCoverageConfig = {
  kind: ClientProductCoverageKind;
  panelId: StatistiquesPanelId;
  title: string;
  description: string;
  kpiLabel: string;
  withLabel: string;
  withoutLabel: string;
  sheetWithTitle: string;
  sheetWithoutTitle: string;
  hint: string;
  matchesType: (typeProduit: string) => boolean;
};

const SCPI_TYPES = new Set(["SCPI", "SCPI_DEMEMBREMENT", "SCPI_FISCALE"]);
const IMMOBILIER_TYPE_SET = new Set<string>(IMMOBILIER_TYPES);

export const CLIENT_PRODUCT_COVERAGE_CONFIGS: ClientProductCoverageConfig[] = [
  {
    kind: "assurance_vie",
    panelId: "client_assurance_vie",
    title: "Assurance-vie",
    description:
      "Part des clients actifs ayant au moins un contrat assurance-vie « avec moi » (direct ou via le foyer).",
    kpiLabel: "Avec assurance-vie",
    withLabel: "Avec assurance-vie",
    withoutLabel: "Sans assurance-vie",
    sheetWithTitle: "Clients actifs — avec assurance-vie",
    sheetWithoutTitle: "Clients actifs — sans assurance-vie",
    hint: "Placements « avec moi » uniquement — clients actifs, hors anciens clients.",
    matchesType: (type) => type === "ASSURANCE_VIE",
  },
  {
    kind: "scpi",
    panelId: "client_scpi",
    title: "SCPI",
    description:
      "Part des clients actifs ayant au moins une SCPI « avec moi » (pleine propriété, démembrement ou à crédit).",
    kpiLabel: "Avec SCPI",
    withLabel: "Avec SCPI",
    withoutLabel: "Sans SCPI",
    sheetWithTitle: "Clients actifs — avec SCPI",
    sheetWithoutTitle: "Clients actifs — sans SCPI",
    hint: "Toutes SCPI « avec moi » — clients actifs, hors anciens clients.",
    matchesType: (type) => SCPI_TYPES.has(type),
  },
  {
    kind: "per",
    panelId: "client_per",
    title: "PER",
    description:
      "Part des clients actifs ayant au moins un PER « avec moi » (direct ou via le foyer).",
    kpiLabel: "Avec PER",
    withLabel: "Avec PER",
    withoutLabel: "Sans PER",
    sheetWithTitle: "Clients actifs — avec PER",
    sheetWithoutTitle: "Clients actifs — sans PER",
    hint: "Placements « avec moi » uniquement — clients actifs, hors anciens clients.",
    matchesType: (type) => type === "PER",
  },
  {
    kind: "immobilier",
    panelId: "client_immobilier",
    title: "Immobilier",
    description:
      "Part des clients actifs ayant au moins un investissement immobilier « avec moi » (direct ou via le foyer).",
    kpiLabel: "Avec immobilier",
    withLabel: "Avec immobilier",
    withoutLabel: "Sans immobilier",
    sheetWithTitle: "Clients actifs — avec immobilier",
    sheetWithoutTitle: "Clients actifs — sans immobilier",
    hint: "Tous types immobilier « avec moi » — clients actifs, hors anciens clients.",
    matchesType: (type) => IMMOBILIER_TYPE_SET.has(type),
  },
];

/** Client actif — hors anciens clients (EN_PAUSE). */
export function isContactEligibleForClientProductCoverageStats(
  contact: Pick<Contact, "categorie"> & Pick<Partial<Contact>, "statut_suivi">
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  if (contact.categorie !== "CLIENT") return false;
  return (contact.statut_suivi ?? "ACTIF") !== "EN_PAUSE";
}

function investissementMatchesContact(
  inv: Pick<Investissement, "origine" | "contact_id" | "foyer_id">,
  contact: Pick<Contact, "id" | "foyer_id">
): boolean {
  if (inv.origine !== "MON_CONSEIL") return false;
  if (inv.contact_id != null) return inv.contact_id === contact.id;
  return (
    inv.contact_id == null &&
    inv.foyer_id != null &&
    contact.foyer_id != null &&
    inv.foyer_id === contact.foyer_id
  );
}

export function contactHasProductCoverage(
  contact: Pick<Contact, "id" | "foyer_id">,
  investissements: Pick<Investissement, "origine" | "type_produit" | "contact_id" | "foyer_id">[],
  config: Pick<ClientProductCoverageConfig, "matchesType">
): boolean {
  return investissements.some(
    (inv) => config.matchesType(inv.type_produit) && investissementMatchesContact(inv, contact)
  );
}

export function computeClientProductCoverageStats(
  contacts: Contact[],
  investissements: Investissement[],
  config: Pick<ClientProductCoverageConfig, "matchesType">
): ClientProductCoverageStatResult {
  const withProductContactIds: number[] = [];
  const withoutProductContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isContactEligibleForClientProductCoverageStats(contact) || contact.id == null) continue;
    if (contactHasProductCoverage(contact, investissements, config)) {
      withProductContactIds.push(contact.id);
    } else {
      withoutProductContactIds.push(contact.id);
    }
  }

  const totalCount = withProductContactIds.length + withoutProductContactIds.length;
  const withProductCount = withProductContactIds.length;

  return {
    totalCount,
    withProductCount,
    withProductPercent: totalCount > 0 ? (withProductCount / totalCount) * 100 : 0,
    withProductContactIds,
    withoutProductContactIds,
  };
}

export function filterContactsForClientProductCoverageList(
  contacts: Contact[],
  kind: ClientProductCoverageListKind,
  investissements: Investissement[],
  config: Pick<ClientProductCoverageConfig, "matchesType">
): Contact[] {
  return contacts.filter((contact) => {
    if (!isContactEligibleForClientProductCoverageStats(contact)) return false;
    const hasProduct = contactHasProductCoverage(contact, investissements, config);
    return kind === "withProduct" ? hasProduct : !hasProduct;
  });
}

export function formatClientProductCoveragePercent(percent: number): string {
  return `${percent.toFixed(1).replace(".0", "")} %`;
}

export function formatClientProductCoverageSubtitle(stats: ClientProductCoverageStatResult): string {
  return `${stats.withProductCount}/${stats.totalCount} clients actifs`;
}

export function getClientProductCoverageConfig(
  kind: ClientProductCoverageKind
): ClientProductCoverageConfig {
  const config = CLIENT_PRODUCT_COVERAGE_CONFIGS.find((entry) => entry.kind === kind);
  if (!config) throw new Error(`Unknown product coverage kind: ${kind}`);
  return config;
}
