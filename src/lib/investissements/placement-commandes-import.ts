import type { Contact } from "@/lib/api/tauri-contacts";
import { getAllContacts, updateContact } from "@/lib/api/tauri-contacts";
import {
  createFoyer,
  getAllFoyers,
  type Foyer,
} from "@/lib/api/tauri-foyers";
import {
  closeInvestissement,
  createInvestissement,
  getAllInvestissements,
  updateInvestissement,
  type Investissement,
  type NewInvestissement,
} from "@/lib/api/tauri-investissements";
import {
  createPartenaire,
  getAllPartenaires,
  type Partenaire,
  type NewPartenaire,
} from "@/lib/api/tauri-partenaires";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";
import {
  deduireTypePartenaire,
  findMatchingPartenaire,
} from "@/lib/contacts/partenaire-match";
import {
  contactNameKeyCanonical,
  findContactByNameKeyWithSwap,
} from "@/lib/contacts/name-match";
import { isoToDateInput, parseImportDate } from "@/lib/contacts/parse-import-date";
import { unixToDateInput } from "@/lib/dates/calendar-date";
import {
  buildFoyerNomFromMembers,
  findExistingFoyerByFamilleName,
  linkContactToFoyer,
} from "@/lib/foyers/foyer-utils";
import { numeroContratMatchKey } from "@/lib/investissements/investissement-display";
import { notifyInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { parseNomCompletInvestisseur } from "@/lib/contacts/investor-name-parse";
import { parseImportMontantEuros } from "@/lib/investissements/parse-import-montant-euros";

const IMPORT_SAVE_OPTS = { skipPostSaveHooks: true } as const;

const COLUMN_ALIASES = {
  investorNomComplet: ["nom complet investisseur"],
  investorEmail: ["email investisseur"],
  coNomComplet: ["co-investisseur - nom prénom", "co-investisseur - nom prenom"],
  coEmail: ["co-investisseur - mail"],
  typeProduit: ["type produit"],
  partenaire: ["partenaire"],
  libelleProduit: ["libellé produit", "libelle produit"],
  numeroContrat: ["numéro de contrat", "numero de contrat"],
  dateEffet: ["date effet"],
  dateSortie: ["date de sortie"],
  etatCommande: ["etat commande", "état commande"],
  viEncours: ["dont versement initial en-cours"],
  viExercice: ["dont versement initial sur ex"],
  typeDernierMv: ["type du dernier mouvement vc"],
  montantDernierMv: ["montant du dernier mouvement vc"],
  vcCumulPeriode: [
    "montant versement vc cumule sur la periode",
    "montant versement vc cumulé sur la période",
    "montant versement vc cumule de la commande",
    "montant versement vc cumulé de la commande",
  ],
  vpFrequence: ["programmation de versements", "fréquence", "frequence"],
  vpMontant: ["programmation montant versement"],
} as const;

export type PlacementEtatCommande = "EN_COURS" | "CLOSE" | "NON_CONFORME";

export type PlacementCommandeRow = {
  rowIndex: number;
  investorNom: string;
  investorPrenom: string;
  investorEmail: string;
  coInvestorNom?: string;
  coInvestorPrenom?: string;
  coInvestorEmail?: string;
  typeProduit: string;
  partenaireNom: string;
  nomProduit: string;
  numeroContrat?: string;
  montantCentimes: number;
  dateEffetIso?: string;
  dateSortieIso?: string;
  etatCommande: PlacementEtatCommande;
  versementProgramme: boolean;
  montantVpCentimes?: number;
  frequenceVp?: string;
  reinvestissementDividendes?: boolean;
  /** 1–100, pertinent si reinvestissementDividendes. */
  pourcentageReinvestissement?: number;
};

export type PlacementImportLineStatus =
  | "ready"
  | "review"
  | "invalid"
  | "contact_not_found"
  | "co_contact_not_found"
  | "duplicate_crm"
  | "duplicate_csv"
  | "imported";

export const PLACEMENT_VP_FREQUENCE_OPTIONS = [
  { value: "", label: "—" },
  { value: "MENSUEL", label: "Mensuel" },
  { value: "TRIMESTRIEL", label: "Trimestriel" },
  { value: "SEMESTRIEL", label: "Semestriel" },
  { value: "ANNUEL", label: "Annuel" },
] as const;

/** AV, PER, contrat de capitalisation — fusion VI/VP par n° contrat. */
export function isPlacementContratVpMerge(typeProduit: string): boolean {
  return (
    typeProduit === "ASSURANCE_VIE" ||
    typeProduit === "PER" ||
    typeProduit === "CONTRAT_CAPITALISATION"
  );
}

/** @deprecated Préférer isPlacementContratVpMerge */
export function isPlacementAvOrPer(typeProduit: string): boolean {
  return isPlacementContratVpMerge(typeProduit);
}

/** SCPI, FIP/FCPI, G3F — le n° contrat n'est pas obligatoire à l'import. */
export function isPlacementSansContratObligatoire(typeProduit: string): boolean {
  return typeProduit === "SCPI" || typeProduit === "FIP_FCPI" || typeProduit === "G3F";
}

/** VI, VP, réinv. dividendes et date souscription éditables en preview (export incomplet). */
export function isPlacementPreviewViVpEditable(typeProduit: string): boolean {
  return (
    isPlacementContratVpMerge(typeProduit) || isPlacementSansContratObligatoire(typeProduit)
  );
}

export function isPlacementPreviewScpiReinvestEditable(typeProduit: string): boolean {
  return typeProduit === "SCPI";
}

/**
 * SCPI : réinvest. dividendes si dernier VC < cumul et montant 0–300 € **avec centimes**
 * (ex. 44,02 €). VP mensuel = montants entiers (50, 208, 300…).
 */
export function isScpiLikelyDividendReinvestmentCentimes(centimes: number): boolean {
  if (centimes <= 0 || centimes > 300_00) return false;
  return centimes % 100 !== 0;
}

/** VI absent sur ligne contrat (VP seule dans l'export) — à vérifier en preview. */
export function placementContratVpNeedsReview(
  line: Pick<
    PlacementCommandeRow,
    "typeProduit" | "montantCentimes" | "versementProgramme" | "montantVpCentimes"
  >
): boolean {
  if (isPlacementContratVpMerge(line.typeProduit)) return line.montantCentimes === 0;
  if (line.typeProduit === "SCPI") return line.montantCentimes === 0;
  return false;
}

/** Clé de fusion SCPI : investisseur (+ co) + nom produit nettoyé. */
export function placementScpiMergeKey(
  row: Pick<
    PlacementCommandeRow,
    | "typeProduit"
    | "investorNom"
    | "investorPrenom"
    | "coInvestorNom"
    | "coInvestorPrenom"
    | "nomProduit"
  >
): string | undefined {
  if (row.typeProduit !== "SCPI") return undefined;
  const coKey =
    row.coInvestorNom && row.coInvestorPrenom
      ? contactNameKeyCanonical(row.coInvestorNom, row.coInvestorPrenom)
      : "";
  return `${contactNameKeyCanonical(row.investorNom, row.investorPrenom)}|${coKey}|${row.nomProduit.toUpperCase().trim()}`;
}

/**
 * SCPI : tout est « Versement initial » dans le type mouvement.
 * VP si montant dernier VC < cumul versements VC sur la période.
 */
export function resolvePlacementScpiRowAmounts(
  raw: Record<string, unknown>,
  keys: {
    montantDernierMv?: string;
    vcCumulPeriode?: string;
    vpFrequence?: string;
  }
): {
  montantCentimes: number | null;
  isVpOnlyRow: boolean;
  isReinvestOnlyRow: boolean;
  versementProgramme: boolean;
  montantVpCentimes?: number;
  frequenceVp?: string;
  reinvestissementDividendes: boolean;
  pourcentageReinvestissement?: number;
} {
  const mv = keys.montantDernierMv
    ? parseEuroCellCentimes(raw[keys.montantDernierMv])
    : null;
  const cumul = keys.vcCumulPeriode
    ? parseEuroCellCentimes(raw[keys.vcCumulPeriode])
    : null;

  if (mv == null) {
    return {
      montantCentimes: null,
      isVpOnlyRow: false,
      isReinvestOnlyRow: false,
      versementProgramme: false,
      reinvestissementDividendes: false,
    };
  }

  if (cumul != null && mv < cumul) {
    if (isScpiLikelyDividendReinvestmentCentimes(mv)) {
      return {
        montantCentimes: null,
        isVpOnlyRow: false,
        isReinvestOnlyRow: true,
        versementProgramme: false,
        reinvestissementDividendes: true,
        pourcentageReinvestissement: 100,
      };
    }
    const vpFreqRaw = keys.vpFrequence ? cellStr(raw[keys.vpFrequence]) : "";
    const frequenceVp = mapVpFrequence(vpFreqRaw) ?? "MENSUEL";
    return {
      montantCentimes: null,
      isVpOnlyRow: true,
      isReinvestOnlyRow: false,
      versementProgramme: true,
      montantVpCentimes: mv,
      frequenceVp,
      reinvestissementDividendes: false,
    };
  }

  return {
    montantCentimes: mv,
    isVpOnlyRow: false,
    isReinvestOnlyRow: false,
    versementProgramme: false,
    reinvestissementDividendes: false,
  };
}

/** @deprecated Préférer placementContratVpNeedsReview */
export function placementAvPerNeedsReview(
  line: Pick<
    PlacementCommandeRow,
    "typeProduit" | "montantCentimes" | "versementProgramme" | "montantVpCentimes"
  >
): boolean {
  return placementContratVpNeedsReview(line);
}

export function formatPlacementEuroField(centimes: number): string {
  if (centimes === 0) return "0";
  return (centimes / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Montant euro saisi en preview (accepte 0). */
export function parsePlacementEuroFieldCentimes(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const euros = parseImportMontantEuros(trimmed);
  if (euros == null || euros < 0) return null;
  return Math.round(euros * 100);
}

export function syncPlacementVpFields(
  montantVpCentimes: number | undefined,
  frequenceVp: string | undefined
): Pick<PlacementCommandeRow, "versementProgramme" | "montantVpCentimes" | "frequenceVp"> {
  const freq = frequenceVp?.trim() || undefined;
  const amount =
    montantVpCentimes != null && montantVpCentimes > 0 ? montantVpCentimes : undefined;
  if (!freq && amount == null) {
    return { versementProgramme: false, montantVpCentimes: undefined, frequenceVp: undefined };
  }
  return {
    versementProgramme: !!(freq && amount != null),
    montantVpCentimes: amount,
    frequenceVp: freq,
  };
}

export function syncPlacementScpiReinvestFields(
  reinvestissementDividendes: boolean | undefined,
  pourcentageReinvestissement: number | undefined
): Pick<
  PlacementCommandeRow,
  "reinvestissementDividendes" | "pourcentageReinvestissement"
> {
  if (!reinvestissementDividendes) {
    return { reinvestissementDividendes: false, pourcentageReinvestissement: undefined };
  }
  const pct = pourcentageReinvestissement ?? 100;
  const clamped = Math.min(100, Math.max(1, Math.round(pct)));
  return { reinvestissementDividendes: true, pourcentageReinvestissement: clamped };
}

export function formatPlacementReinvestNotes(pourcentage: number): string {
  return `Réinv. ${pourcentage}%`;
}

export type PlacementImportPreviewLine = PlacementCommandeRow & {
  lineKey: string;
  status: PlacementImportLineStatus;
  statusMessage: string;
  contactId?: number;
  coContactId?: number;
  foyerId?: number;
  partenaireId?: number;
  investissementId?: number;
  contactLabel?: string;
  coContactLabel?: string;
};

export type PlacementImportPreviewSummary = {
  total: number;
  ready: number;
  review: number;
  invalid: number;
  contactNotFound: number;
  coContactNotFound: number;
  duplicateCrm: number;
  duplicateCsv: number;
  imported: number;
};

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findColumnKey(
  sampleRow: Record<string, unknown>,
  aliases: readonly string[]
): string | undefined {
  for (const key of Object.keys(sampleRow)) {
    const normalized = normalizeHeader(key);
    if (
      aliases.some((alias) => {
        if (alias.startsWith("^") && alias.endsWith("$")) {
          return normalized === alias.slice(1, -1);
        }
        return normalized === alias || normalized.includes(alias);
      })
    ) {
      return key;
    }
  }
  return undefined;
}

function cellStr(value: unknown): string {
  return String(value ?? "").trim();
}

/** Retire le préfixe export « 10 NOM Prénom ». */
export function stripPlacementNamePrefix(full: string): string {
  return full.trim().replace(/^10\s+/i, "").trim();
}

export function parsePlacementInvestorName(
  full: string
): { nom: string; prenom: string } | null {
  return parseNomCompletInvestisseur(stripPlacementNamePrefix(full));
}

/** Retire ALPSI / CIF en fin de libellé produit. */
export function cleanPlacementLibelleProduit(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\s*\(ALPSI\)\s*/gi, " ");
  s = s.replace(/\s*\(CIF\)\s*/gi, " ");
  s = s.replace(/\s+ALPSI\s*$/gi, "");
  s = s.replace(/\s+CIF\s*$/gi, "");
  return s.replace(/\s+/g, " ").trim();
}

export function mapPlacementTypeProduit(typeProduit: string): string | null {
  const k = typeProduit
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!k) return null;
  if (k.includes("assurance") && k.includes("vie")) return "ASSURANCE_VIE";
  if (k.includes("scpi")) return "SCPI";
  if (k.includes("epargne") && k.includes("retraite")) return "PER";
  if (k.includes("capitalisation")) return "CONTRAT_CAPITALISATION";
  if (k.includes("g3f")) return "G3F";
  if (k.includes("capital") && k.includes("investissement")) return "FIP_FCPI";
  if (k.includes("prevoyance")) return "AUTRE";
  return "AUTRE";
}

export function parsePlacementEtatCommande(raw: string): PlacementEtatCommande | null {
  const k = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!k) return null;
  if (k.startsWith("en-cours") || k.startsWith("en cours")) return "EN_COURS";
  if (k.startsWith("close")) return "CLOSE";
  if (k.includes("non conforme")) return "NON_CONFORME";
  return null;
}

function parseEuroCellCentimes(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null;
    return Math.round(value * 100);
  }
  const euros = parseImportMontantEuros(String(value));
  if (euros == null || euros <= 0) return null;
  return Math.round(euros * 100);
}

export function resolvePlacementMontantInitialCentimes(
  raw: Record<string, unknown>,
  keys: {
    viEncours?: string;
    viExercice?: string;
    typeDernierMv?: string;
    montantDernierMv?: string;
  }
): number | null {
  if (keys.viEncours) {
    const vi = parseEuroCellCentimes(raw[keys.viEncours]);
    if (vi != null) return vi;
  }
  const typeMv = keys.typeDernierMv
    ? normalizeMovementTypeLabel(cellStr(raw[keys.typeDernierMv]))
    : "";
  if (/versement\s+initial\b/.test(typeMv) && keys.montantDernierMv) {
    const mv = parseEuroCellCentimes(raw[keys.montantDernierMv]);
    if (mv != null) return mv;
  }
  if (keys.viExercice) {
    const viEx = parseEuroCellCentimes(raw[keys.viExercice]);
    if (viEx != null) return viEx;
  }
  return null;
}

/** Date de souscription = colonne Date Effet uniquement. */
export function resolvePlacementDateEffetIso(
  raw: Record<string, unknown>,
  keys: { dateEffet?: string }
): string | undefined {
  if (!keys.dateEffet) return undefined;
  return parseImportDate(raw[keys.dateEffet]);
}

export type PlacementParsedRow = Omit<PlacementCommandeRow, "montantCentimes"> & {
  montantCentimes: number | null;
};

/** Rattache VP (ligne sans VI) à la ligne VI de même n° contrat. */
export function mergePlacementVpByContract(
  rows: PlacementParsedRow[]
): PlacementCommandeRow[] {
  const vpByContract = new Map<
    string,
    Pick<PlacementCommandeRow, "montantVpCentimes" | "frequenceVp">
  >();

  for (const row of rows) {
    if (row.montantCentimes != null || !row.versementProgramme) continue;
    const key = numeroContratMatchKey(row.numeroContrat);
    if (!key || vpByContract.has(key)) continue;
    vpByContract.set(key, {
      montantVpCentimes: row.montantVpCentimes,
      frequenceVp: row.frequenceVp,
    });
  }

  const merged: PlacementCommandeRow[] = [];
  const mergedContractKeys = new Set<string>();

  for (const row of rows) {
    if (row.montantCentimes == null) continue;
    const key = numeroContratMatchKey(row.numeroContrat);
    const attachedVp =
      key && !row.versementProgramme ? vpByContract.get(key) : undefined;
    if (key && attachedVp) mergedContractKeys.add(key);
    merged.push({
      ...row,
      montantCentimes: row.montantCentimes,
      versementProgramme: attachedVp ? true : row.versementProgramme,
      montantVpCentimes: attachedVp?.montantVpCentimes ?? row.montantVpCentimes,
      frequenceVp: attachedVp?.frequenceVp ?? row.frequenceVp,
    });
  }

  // AV/PER/capitalisation : ligne VP seule (export illisible) → VI=0 + VP, corrigeable en preview.
  for (const row of rows) {
    if (row.montantCentimes != null || !row.versementProgramme) continue;
    if (!isPlacementContratVpMerge(row.typeProduit)) continue;
    const key = numeroContratMatchKey(row.numeroContrat);
    if (!key || mergedContractKeys.has(key)) continue;
    merged.push({
      ...row,
      montantCentimes: 0,
      versementProgramme: true,
      montantVpCentimes: row.montantVpCentimes,
      frequenceVp: row.frequenceVp,
    });
  }

  return merged;
}

function placementParsedMergeKey(row: PlacementParsedRow): string {
  const scpiKey = placementScpiMergeKey(row);
  if (scpiKey) return `scpi|${scpiKey}`;
  const contratKey = numeroContratMatchKey(row.numeroContrat);
  if (contratKey && isPlacementContratVpMerge(row.typeProduit)) {
    return `contrat|${contratKey}`;
  }
  return `row|${row.rowIndex}`;
}

function placementMergedLookupKey(row: PlacementCommandeRow): string {
  const scpiKey = placementScpiMergeKey(row);
  if (scpiKey) return `scpi|${scpiKey}`;
  const contratKey = numeroContratMatchKey(row.numeroContrat);
  if (contratKey && isPlacementContratVpMerge(row.typeProduit)) {
    return `contrat|${contratKey}`;
  }
  return `row|${row.rowIndex}`;
}

/** SCPI : fusion VI + VP + réinv. dividendes par investisseur et nom de SCPI (pas n° contrat). */
export function mergePlacementScpiByInvestorProduct(
  rows: PlacementParsedRow[]
): PlacementCommandeRow[] {
  const vpByKey = new Map<
    string,
    Pick<PlacementCommandeRow, "montantVpCentimes" | "frequenceVp">
  >();
  const reinvestByKey = new Map<
    string,
    Pick<PlacementCommandeRow, "reinvestissementDividendes" | "pourcentageReinvestissement">
  >();

  for (const row of rows) {
    const key = placementScpiMergeKey(row);
    if (!key) continue;
    if (row.reinvestissementDividendes && !reinvestByKey.has(key)) {
      reinvestByKey.set(key, {
        reinvestissementDividendes: true,
        pourcentageReinvestissement: row.pourcentageReinvestissement ?? 100,
      });
    }
    if (row.montantCentimes != null || !row.versementProgramme || row.reinvestissementDividendes) {
      continue;
    }
    if (vpByKey.has(key)) continue;
    vpByKey.set(key, {
      montantVpCentimes: row.montantVpCentimes,
      frequenceVp: row.frequenceVp,
    });
  }

  const merged: PlacementCommandeRow[] = [];
  const mergedKeys = new Set<string>();

  for (const row of rows) {
    if (row.montantCentimes == null) continue;
    const key = placementScpiMergeKey(row);
    const attachedVp =
      key && !row.versementProgramme ? vpByKey.get(key) : undefined;
    const attachedReinvest = key ? reinvestByKey.get(key) : undefined;
    if (key && (attachedVp || attachedReinvest)) mergedKeys.add(key);
    merged.push({
      ...row,
      montantCentimes: row.montantCentimes,
      versementProgramme: attachedVp ? true : row.versementProgramme,
      montantVpCentimes: attachedVp?.montantVpCentimes ?? row.montantVpCentimes,
      frequenceVp: attachedVp?.frequenceVp ?? row.frequenceVp,
      reinvestissementDividendes:
        attachedReinvest?.reinvestissementDividendes ??
        row.reinvestissementDividendes ??
        false,
      pourcentageReinvestissement: attachedReinvest
        ? attachedReinvest.pourcentageReinvestissement
        : row.reinvestissementDividendes
          ? (row.pourcentageReinvestissement ?? 100)
          : undefined,
    });
  }

  for (const row of rows) {
    if (row.montantCentimes != null || !row.versementProgramme || row.reinvestissementDividendes) {
      continue;
    }
    const key = placementScpiMergeKey(row);
    if (!key || mergedKeys.has(key)) continue;
    const attachedReinvest = reinvestByKey.get(key);
    merged.push({
      ...row,
      montantCentimes: 0,
      versementProgramme: true,
      montantVpCentimes: row.montantVpCentimes,
      frequenceVp: row.frequenceVp,
      reinvestissementDividendes: attachedReinvest?.reinvestissementDividendes ?? false,
      pourcentageReinvestissement: attachedReinvest?.pourcentageReinvestissement,
    });
    mergedKeys.add(key);
  }

  for (const row of rows) {
    if (row.montantCentimes != null || !row.reinvestissementDividendes || row.versementProgramme) {
      continue;
    }
    const key = placementScpiMergeKey(row);
    if (!key || mergedKeys.has(key)) continue;
    merged.push({
      ...row,
      montantCentimes: 0,
      versementProgramme: false,
      montantVpCentimes: undefined,
      frequenceVp: undefined,
      reinvestissementDividendes: true,
      pourcentageReinvestissement: row.pourcentageReinvestissement ?? 100,
    });
    mergedKeys.add(key);
  }

  return merged;
}

function mapVpFrequence(raw: string): string | undefined {
  const k = raw.trim().toLowerCase();
  if (!k || k === "aucune" || k === "-") return undefined;
  if (k.includes("mensuel") || k.includes("mois")) return "MENSUEL";
  if (k.includes("trimestriel") || k.includes("trimestre")) return "TRIMESTRIEL";
  if (k.includes("semestriel") || k.includes("semestre")) return "SEMESTRIEL";
  if (k.includes("annuel") || k === "an") return "ANNUEL";
  return undefined;
}

function normalizeMovementTypeLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mapVpFrequenceFromMovementType(typeMv: string): string | undefined {
  const k = normalizeMovementTypeLabel(typeMv);
  const tail = k.split(/\s*[-–—]\s*/).pop() ?? k;
  return mapVpFrequence(tail) ?? mapVpFrequence(k.replace(/versement\s+programme\s*[-–—]?\s*/i, ""));
}

function resolvePlacementVersementProgramme(
  raw: Record<string, unknown>,
  keys: {
    vpFrequence?: string;
    vpMontant?: string;
    typeDernierMv?: string;
    montantDernierMv?: string;
  }
): {
  versementProgramme: boolean;
  montantVpCentimes?: number;
  frequenceVp?: string;
} {
  const vpFreqRaw = keys.vpFrequence ? cellStr(raw[keys.vpFrequence]) : "";
  let frequenceVp = mapVpFrequence(vpFreqRaw);
  let montantVpCentimes =
    frequenceVp && keys.vpMontant
      ? parseEuroCellCentimes(raw[keys.vpMontant]) ?? undefined
      : undefined;

  const typeMv = keys.typeDernierMv
    ? normalizeMovementTypeLabel(cellStr(raw[keys.typeDernierMv]))
    : "";
  if (typeMv.includes("versement program")) {
    frequenceVp = frequenceVp ?? mapVpFrequenceFromMovementType(typeMv);
    if (montantVpCentimes == null && keys.montantDernierMv) {
      montantVpCentimes = parseEuroCellCentimes(raw[keys.montantDernierMv]) ?? undefined;
    }
  }

  return {
    versementProgramme: !!frequenceVp,
    montantVpCentimes,
    frequenceVp,
  };
}

function resolveColumnKeysFromRows(
  rawRows: Record<string, unknown>[]
): Record<keyof typeof COLUMN_ALIASES, string | undefined> {
  const merged: Record<string, unknown> = {};
  for (const row of rawRows) {
    for (const key of Object.keys(row)) {
      if (!(key in merged)) merged[key] = row[key];
    }
  }
  return resolveColumnKeys(merged);
}

function resolveColumnKeys(
  sampleRow: Record<string, unknown>
): Record<keyof typeof COLUMN_ALIASES, string | undefined> {
  return {
    investorNomComplet: findColumnKey(sampleRow, COLUMN_ALIASES.investorNomComplet),
    investorEmail: findColumnKey(sampleRow, COLUMN_ALIASES.investorEmail),
    coNomComplet: findColumnKey(sampleRow, COLUMN_ALIASES.coNomComplet),
    coEmail: findColumnKey(sampleRow, COLUMN_ALIASES.coEmail),
    typeProduit: findColumnKey(sampleRow, COLUMN_ALIASES.typeProduit),
    partenaire: findColumnKey(sampleRow, COLUMN_ALIASES.partenaire),
    libelleProduit: findColumnKey(sampleRow, COLUMN_ALIASES.libelleProduit),
    numeroContrat: findColumnKey(sampleRow, COLUMN_ALIASES.numeroContrat),
    dateEffet: findColumnKey(sampleRow, COLUMN_ALIASES.dateEffet),
    dateSortie: findColumnKey(sampleRow, COLUMN_ALIASES.dateSortie),
    etatCommande: findColumnKey(sampleRow, COLUMN_ALIASES.etatCommande),
    viEncours: findColumnKey(sampleRow, COLUMN_ALIASES.viEncours),
    viExercice: findColumnKey(sampleRow, COLUMN_ALIASES.viExercice),
    typeDernierMv: findColumnKey(sampleRow, COLUMN_ALIASES.typeDernierMv),
    montantDernierMv: findColumnKey(sampleRow, COLUMN_ALIASES.montantDernierMv),
    vcCumulPeriode: findColumnKey(sampleRow, COLUMN_ALIASES.vcCumulPeriode),
    vpFrequence: findColumnKey(sampleRow, COLUMN_ALIASES.vpFrequence),
    vpMontant: findColumnKey(sampleRow, COLUMN_ALIASES.vpMontant),
  };
}

function parsePlacementParsedRows(
  rawRows: Record<string, unknown>[]
): PlacementParsedRow[] {
  if (rawRows.length === 0) return [];
  const keys = resolveColumnKeysFromRows(rawRows);
  const parsed: PlacementParsedRow[] = [];

  rawRows.forEach((raw, index) => {
    const rowIndex = index + 2;
    const investorFull = keys.investorNomComplet
      ? cellStr(raw[keys.investorNomComplet])
      : "";
    const investor = parsePlacementInvestorName(investorFull);
    const typeRaw = keys.typeProduit ? cellStr(raw[keys.typeProduit]) : "";
    const typeProduit = mapPlacementTypeProduit(typeRaw);
    const libelleRaw = keys.libelleProduit ? cellStr(raw[keys.libelleProduit]) : "";
    const nomProduit = cleanPlacementLibelleProduit(libelleRaw);
    const numeroContrat = keys.numeroContrat
      ? cellStr(raw[keys.numeroContrat]) || undefined
      : undefined;

    let montantCentimes: number | null;
    let isVpOnlyRow = false;
    let isReinvestOnlyRow = false;
    let reinvestissementDividendes = false;
    let pourcentageReinvestissement: number | undefined;
    let vp: {
      versementProgramme: boolean;
      montantVpCentimes?: number;
      frequenceVp?: string;
    };

    if (typeProduit === "SCPI") {
      const scpi = resolvePlacementScpiRowAmounts(raw, {
        montantDernierMv: keys.montantDernierMv,
        vcCumulPeriode: keys.vcCumulPeriode,
        vpFrequence: keys.vpFrequence,
      });
      montantCentimes = scpi.montantCentimes;
      isVpOnlyRow = scpi.isVpOnlyRow;
      isReinvestOnlyRow = scpi.isReinvestOnlyRow;
      reinvestissementDividendes = scpi.reinvestissementDividendes;
      pourcentageReinvestissement = scpi.pourcentageReinvestissement;
      vp = {
        versementProgramme: scpi.versementProgramme,
        montantVpCentimes: scpi.montantVpCentimes,
        frequenceVp: scpi.frequenceVp,
      };
    } else {
      vp = resolvePlacementVersementProgramme(raw, {
        vpFrequence: keys.vpFrequence,
        vpMontant: keys.vpMontant,
        typeDernierMv: keys.typeDernierMv,
        montantDernierMv: keys.montantDernierMv,
      });
      montantCentimes = resolvePlacementMontantInitialCentimes(raw, {
        viEncours: keys.viEncours,
        viExercice: keys.viExercice,
        typeDernierMv: keys.typeDernierMv,
        montantDernierMv: keys.montantDernierMv,
      });
      if (
        typeProduit &&
        vp.versementProgramme &&
        numeroContratMatchKey(numeroContrat) &&
        isPlacementContratVpMerge(typeProduit)
      ) {
        montantCentimes = null;
      }
      isVpOnlyRow =
        montantCentimes == null &&
        !!typeProduit &&
        vp.versementProgramme &&
        isPlacementContratVpMerge(typeProduit) &&
        !!numeroContratMatchKey(numeroContrat);
    }

    const etatRaw = keys.etatCommande ? cellStr(raw[keys.etatCommande]) : "";
    const etatCommande = parsePlacementEtatCommande(etatRaw);
    if (!etatCommande || etatCommande === "NON_CONFORME") return;
    if (typeProduit === "SCPI" && etatCommande === "CLOSE") return;

    if (!investor || !typeProduit || !nomProduit) return;
    if (montantCentimes == null && !isVpOnlyRow && !isReinvestOnlyRow) return;

    const coParsed = keys.coNomComplet
      ? parsePlacementInvestorName(cellStr(raw[keys.coNomComplet]))
      : null;

    parsed.push({
      rowIndex,
      investorNom: investor.nom,
      investorPrenom: investor.prenom,
      investorEmail: keys.investorEmail ? cellStr(raw[keys.investorEmail]) : "",
      coInvestorNom: coParsed?.nom,
      coInvestorPrenom: coParsed?.prenom,
      coInvestorEmail: keys.coEmail ? cellStr(raw[keys.coEmail]) : undefined,
      typeProduit,
      partenaireNom: keys.partenaire ? cellStr(raw[keys.partenaire]) : "",
      nomProduit,
      numeroContrat,
      montantCentimes,
      dateEffetIso: resolvePlacementDateEffetIso(raw, { dateEffet: keys.dateEffet }),
      dateSortieIso: keys.dateSortie ? parseImportDate(raw[keys.dateSortie]) : undefined,
      etatCommande,
      versementProgramme: vp.versementProgramme,
      montantVpCentimes: vp.montantVpCentimes,
      frequenceVp: vp.frequenceVp,
      reinvestissementDividendes,
      pourcentageReinvestissement,
    });
  });

  return parsed;
}

export function parsePlacementCommandeRows(
  rawRows: Record<string, unknown>[]
): PlacementCommandeRow[] {
  const parsed = parsePlacementParsedRows(rawRows);
  const scpiRows = parsed.filter((r) => r.typeProduit === "SCPI");
  const otherRows = parsed.filter((r) => r.typeProduit !== "SCPI");
  const scpiMerged = mergePlacementScpiByInvestorProduct(scpiRows);
  const otherMerged = mergePlacementVpByContract(otherRows);

  const mergedByKey = new Map<string, PlacementCommandeRow>();
  for (const row of otherMerged) {
    mergedByKey.set(placementMergedLookupKey(row), row);
  }
  for (const row of scpiMerged) {
    mergedByKey.set(placementMergedLookupKey(row), row);
  }

  const emitted = new Set<string>();
  const ordered: PlacementCommandeRow[] = [];
  for (const row of parsed) {
    const key = placementParsedMergeKey(row);
    if (emitted.has(key)) continue;
    const merged = mergedByKey.get(key);
    if (!merged) continue;
    ordered.push(merged);
    emitted.add(key);
  }
  return ordered;
}

export function resolveContactForPlacementImport(
  contacts: Contact[],
  nom: string,
  prenom: string,
  email?: string
): Contact | undefined {
  const byName = findContactByNameKeyWithSwap(contacts, nom, prenom);
  if (byName) return byName;
  const em = email?.trim().toLowerCase();
  if (!em || em === "-") return undefined;
  return contacts.find((c) => c.email?.trim().toLowerCase() === em);
}

function normalizePlacementNomPart(part: string): string {
  return cleanPlacementLibelleProduit(part)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function placementNomWordSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

const PLACEMENT_NOM_GENERIC_WORDS = new Set([
  "europe",
  "france",
  "premium",
  "placement",
  "multisupports",
  "multi",
  "supports",
  "rendement",
  "fiscal",
  "fiscale",
  "assurance",
  "vie",
  "scpi",
  "classique",
  "global",
  "world",
  "international",
]);

function distinctivePlacementNomWords(normalizedNom: string): string[] {
  return normalizedNom
    .split(" ")
    .filter((w) => w.length >= 3 && !PLACEMENT_NOM_GENERIC_WORDS.has(w));
}

/** Rapprochement tolérant entre libellé Excel et fiche CRM (ALPSI/CIF ignorés). */
export function placementNomProduitMatches(a: string, b: string): boolean {
  if (a.toUpperCase().trim() === b.toUpperCase().trim()) return true;
  const na = normalizePlacementNomPart(a);
  const nb = normalizePlacementNomPart(b);
  if (na === nb) return true;

  const wordsA = distinctivePlacementNomWords(na);
  const wordsB = distinctivePlacementNomWords(nb);
  if (wordsA.length === 0 || wordsB.length === 0) {
    return na === nb;
  }

  let hits = 0;
  for (const wa of wordsA) {
    if (wordsB.some((wb) => placementNomWordSimilar(wa, wb))) hits += 1;
  }
  const minDistinct = Math.min(wordsA.length, wordsB.length);
  return hits >= minDistinct;
}

function montantPlacementRoughlyMatches(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff <= Math.max(500_00, Math.round(Math.max(a, b) * 0.005));
}

function samePlacementInvestmentOwner(
  inv: Investissement,
  opts: { contactId?: number; foyerId?: number; contactFoyerId?: number }
): boolean {
  if (opts.foyerId != null && inv.foyer_id === opts.foyerId) return true;
  if (opts.contactId != null && inv.contact_id === opts.contactId) return true;
  if (
    opts.contactFoyerId != null &&
    inv.foyer_id != null &&
    inv.foyer_id === opts.contactFoyerId
  ) {
    return true;
  }
  return false;
}

function placementOwnerFromContacts(
  contact: Contact | undefined,
  coContact: Contact | undefined,
  foyerId: number | undefined
): { contactId?: number; foyerId?: number; contactFoyerId?: number } {
  return {
    contactId: coContact ? undefined : contact?.id,
    foyerId,
    contactFoyerId: !coContact && contact ? contact.foyer_id ?? undefined : undefined,
  };
}

function findExistingPlacementInvestissementForPreview(
  investissements: Investissement[],
  contact: Contact,
  coContact: Contact | undefined,
  row: Pick<
    PlacementCommandeRow,
    "numeroContrat" | "typeProduit" | "nomProduit" | "montantCentimes"
  >
): { match?: Investissement; ambiguous?: boolean } {
  if (coContact) {
    const sharedFoyer =
      contact.foyer_id && contact.foyer_id === coContact.foyer_id
        ? contact.foyer_id
        : undefined;
    if (!sharedFoyer) return {};
    return findExistingPlacementInvestissement(investissements, row, {
      foyerId: sharedFoyer,
    });
  }
  return findExistingPlacementInvestissement(investissements, row, {
    contactId: contact.id,
    contactFoyerId: contact.foyer_id ?? undefined,
  });
}

/** Investissement CRM correspondant à une ligne d'aperçu (pour surlignage enrichissement). */
export function resolvePlacementPreviewExistingInvestissement(
  line: PlacementImportPreviewLine,
  investissements: Investissement[],
  contacts?: Contact[]
): Investissement | undefined {
  if (line.investissementId != null) {
    return investissements.find((i) => i.id === line.investissementId);
  }
  if (!line.contactId && !line.foyerId) return undefined;
  const owner = placementOwnerFromContacts(
    line.contactId && contacts
      ? contacts.find((c) => c.id === line.contactId)
      : undefined,
    line.coContactId && contacts
      ? contacts.find((c) => c.id === line.coContactId)
      : undefined,
    line.foyerId
  );
  return findExistingPlacementInvestissement(investissements, line, owner).match;
}

export function findExistingPlacementInvestissement(
  investissements: Investissement[],
  row: Pick<
    PlacementCommandeRow,
    "numeroContrat" | "typeProduit" | "nomProduit" | "montantCentimes"
  >,
  owner: { contactId?: number; foyerId?: number; contactFoyerId?: number }
): { match?: Investissement; ambiguous?: boolean } {
  const contratKey = numeroContratMatchKey(row.numeroContrat);
  if (contratKey) {
    const matches = investissements.filter(
      (inv) => numeroContratMatchKey(inv.numero_contrat) === contratKey
    );
    const ownedMatches = matches.filter((inv) => samePlacementInvestmentOwner(inv, owner));
    if (ownedMatches.length > 1) return { ambiguous: true };
    if (ownedMatches.length === 1) return { match: ownedMatches[0] };
  }

  const candidates = investissements.filter((inv) => {
    if (!samePlacementInvestmentOwner(inv, owner)) return false;
    return inv.type_produit === row.typeProduit;
  });
  if (candidates.length === 0) return {};

  const byNom = candidates.filter((inv) =>
    placementNomProduitMatches(inv.nom_produit, row.nomProduit)
  );
  if (byNom.length === 1) return { match: byNom[0] };
  if (byNom.length > 1) {
    if (row.montantCentimes != null) {
      const byMontant = byNom.filter(
        (inv) =>
          inv.montant_initial != null &&
          montantPlacementRoughlyMatches(inv.montant_initial, row.montantCentimes!)
      );
      if (byMontant.length === 1) return { match: byMontant[0] };
    }
    return { ambiguous: true };
  }

  return {};
}

function businessLineKey(row: PlacementCommandeRow): string {
  const scpiKey = placementScpiMergeKey(row);
  if (scpiKey) return `scpi|${scpiKey}`;
  const contratKey = numeroContratMatchKey(row.numeroContrat);
  if (contratKey) return `contrat|${contratKey}`;
  const coKey =
    row.coInvestorNom && row.coInvestorPrenom
      ? contactNameKeyCanonical(row.coInvestorNom, row.coInvestorPrenom)
      : "";
  return `${contactNameKeyCanonical(row.investorNom, row.investorPrenom)}|${coKey}|${row.nomProduit.toUpperCase()}|${row.montantCentimes}`;
}

type PlacementPreviewContext = {
  contact?: Contact;
  coContact?: Contact;
  contactLabel: string;
  coContactLabel?: string;
  foyerId?: number;
  duplicateCsvRowIndex?: number;
  existing?: Investissement;
  ambiguous?: boolean;
};

function assessPlacementImportLine(
  row: PlacementCommandeRow,
  lineKey: string,
  ctx: PlacementPreviewContext
): PlacementImportPreviewLine {
  const {
    contact,
    coContact,
    contactLabel,
    coContactLabel,
    foyerId,
    duplicateCsvRowIndex,
    existing,
    ambiguous,
  } = ctx;

  const hasCo = !!(row.coInvestorNom && row.coInvestorPrenom);

  if (!row.dateEffetIso) {
    return {
      ...row,
      lineKey,
      status: "invalid",
      statusMessage: "Date de souscription manquante ou illisible (Date Effet)",
      contactId: contact?.id,
      coContactId: coContact?.id,
      contactLabel,
      coContactLabel,
    };
  }

  if (row.etatCommande === "CLOSE" && !row.dateSortieIso) {
    return {
      ...row,
      lineKey,
      status: "invalid",
      statusMessage: "Date de Sortie requise pour une commande Close",
      contactId: contact?.id,
      coContactId: coContact?.id,
      contactLabel,
      coContactLabel,
    };
  }

  if (isPlacementContratVpMerge(row.typeProduit)) {
    const hasVi = row.montantCentimes > 0;
    const hasVp =
      row.versementProgramme &&
      (row.montantVpCentimes ?? 0) > 0 &&
      !!row.frequenceVp;
    if (!hasVi && !hasVp) {
      return {
        ...row,
        lineKey,
        status: "invalid",
        statusMessage: "Renseignez un versement initial ou un versement programmé",
        contactId: contact?.id,
        coContactId: coContact?.id,
        contactLabel,
        coContactLabel,
      };
    }
  }

  if (!contact) {
    return {
      ...row,
      lineKey,
      status: "contact_not_found",
      statusMessage: `Investisseur introuvable (${row.investorPrenom} ${row.investorNom})`,
      contactLabel,
      coContactLabel,
    };
  }

  if (hasCo && !coContact) {
    return {
      ...row,
      lineKey,
      status: "co_contact_not_found",
      statusMessage: `Co-investisseur introuvable (${row.coInvestorPrenom} ${row.coInvestorNom})`,
      contactId: contact.id,
      contactLabel,
      coContactLabel,
    };
  }

  if (duplicateCsvRowIndex != null) {
    return {
      ...row,
      lineKey,
      status: "duplicate_csv",
      statusMessage: `Doublon dans le fichier (ligne ${duplicateCsvRowIndex})`,
      contactId: contact.id,
      coContactId: coContact?.id,
      foyerId,
      contactLabel,
      coContactLabel,
    };
  }

  if (ambiguous) {
    return {
      ...row,
      lineKey,
      status: "duplicate_crm",
      statusMessage: "Plusieurs investissements CRM correspondent à cette ligne",
      contactId: contact.id,
      coContactId: coContact?.id,
      contactLabel,
      coContactLabel,
    };
  }

  if (existing) {
    return {
      ...row,
      lineKey,
      status: "duplicate_crm",
      statusMessage: "Investissement déjà en base",
      contactId: contact.id,
      coContactId: coContact?.id,
      foyerId: foyerId ?? contact.foyer_id ?? undefined,
      investissementId: existing.id,
      contactLabel,
      coContactLabel,
    };
  }

  const etatLabel = row.etatCommande === "CLOSE" ? " — clôture prévue" : "";
  const needsReview = placementContratVpNeedsReview(row);
  const status: PlacementImportLineStatus = needsReview ? "review" : "ready";
  const reviewHint = needsReview ? " — VI absent, vérifiez" : "";
  const closeHint =
    row.etatCommande === "CLOSE" && row.dateSortieIso
      ? ` — clôture ${row.dateSortieIso.slice(0, 10)}`
      : "";
  const statusMessage = hasCo
    ? `Prêt — foyer (${contactLabel} + ${coContactLabel})${etatLabel}${closeHint}${reviewHint}`
    : `Prêt — ${contactLabel}${etatLabel}${closeHint}${reviewHint}`;

  return {
    ...row,
    lineKey,
    status,
    statusMessage,
    contactId: contact.id,
    coContactId: coContact?.id,
    foyerId,
    contactLabel,
    coContactLabel,
  };
}

export function reassessPlacementPreviewLine(
  line: PlacementImportPreviewLine,
  contacts: Contact[],
  investissements: Investissement[],
  seenInFile: ReadonlyMap<string, number>
): PlacementImportPreviewLine {
  const contact = line.contactId
    ? contacts.find((c) => c.id === line.contactId)
    : resolveContactForPlacementImport(
        contacts,
        line.investorNom,
        line.investorPrenom,
        line.investorEmail
      );

  const hasCo = !!(line.coInvestorNom && line.coInvestorPrenom);
  const coContact = line.coContactId
    ? contacts.find((c) => c.id === line.coContactId)
    : hasCo
      ? resolveContactForPlacementImport(
          contacts,
          line.coInvestorNom!,
          line.coInvestorPrenom!,
          line.coInvestorEmail
        )
      : undefined;

  const contactLabel = contact
    ? `${contact.prenom} ${contact.nom}`
    : `${line.investorPrenom} ${line.investorNom}`;
  const coContactLabel =
    hasCo && coContact
      ? `${coContact.prenom} ${coContact.nom}`
      : hasCo
        ? `${line.coInvestorPrenom} ${line.coInvestorNom}`
        : undefined;

  let foyerId: number | undefined;
  if (contact && coContact?.foyer_id && contact.foyer_id === coContact.foyer_id) {
    foyerId = contact.foyer_id;
  }

  const bizKey = businessLineKey(line);
  const firstRow = seenInFile.get(bizKey);
  const duplicateCsvRowIndex =
    firstRow != null && firstRow !== line.rowIndex ? firstRow : undefined;

  const owner = placementOwnerFromContacts(contact, coContact, foyerId);
  const { match: existing, ambiguous } = findExistingPlacementInvestissement(
    investissements,
    line,
    owner
  );

  return assessPlacementImportLine(
    line,
    line.lineKey,
    {
      contact,
      coContact,
      contactLabel,
      coContactLabel,
      foyerId,
      duplicateCsvRowIndex,
      existing,
      ambiguous,
    }
  );
}

export function patchPlacementPreviewLine(
  line: PlacementImportPreviewLine,
  patch: Partial<
    Pick<
      PlacementImportPreviewLine,
      | "montantCentimes"
      | "montantVpCentimes"
      | "frequenceVp"
      | "reinvestissementDividendes"
      | "pourcentageReinvestissement"
      | "dateEffetIso"
      | "dateSortieIso"
    >
  >,
  contacts: Contact[],
  investissements: Investissement[]
): PlacementImportPreviewLine {
  const [next] = patchPlacementPreviewLines([line], line.lineKey, patch, contacts, investissements);
  return next ?? line;
}

function mergePlacementPreviewPatch(
  line: PlacementImportPreviewLine,
  patch: Partial<
    Pick<
      PlacementImportPreviewLine,
      | "montantCentimes"
      | "montantVpCentimes"
      | "frequenceVp"
      | "reinvestissementDividendes"
      | "pourcentageReinvestissement"
      | "dateEffetIso"
      | "dateSortieIso"
    >
  >
): PlacementImportPreviewLine {
  const vpSynced = syncPlacementVpFields(
    patch.montantVpCentimes ?? line.montantVpCentimes,
    patch.frequenceVp ?? line.frequenceVp
  );
  const reinvSynced = syncPlacementScpiReinvestFields(
    patch.reinvestissementDividendes ?? line.reinvestissementDividendes,
    patch.pourcentageReinvestissement ?? line.pourcentageReinvestissement
  );
  return {
    ...line,
    ...patch,
    montantCentimes:
      patch.montantCentimes != null
        ? Math.max(0, patch.montantCentimes)
        : line.montantCentimes,
    ...vpSynced,
    ...reinvSynced,
  };
}

export function buildPlacementPreviewSeenInFileFromLines(
  lines: readonly PlacementImportPreviewLine[]
): Map<string, number> {
  const seen = new Map<string, number>();
  const sorted = [...lines]
    .filter((l) => l.status !== "imported")
    .sort((a, b) => a.rowIndex - b.rowIndex);
  for (const line of sorted) {
    const key = businessLineKey(line);
    if (!seen.has(key)) seen.set(key, line.rowIndex);
  }
  return seen;
}

export function patchPlacementPreviewLines(
  lines: PlacementImportPreviewLine[],
  lineKey: string,
  patch: Partial<
    Pick<
      PlacementImportPreviewLine,
      | "montantCentimes"
      | "montantVpCentimes"
      | "frequenceVp"
      | "reinvestissementDividendes"
      | "pourcentageReinvestissement"
      | "dateEffetIso"
      | "dateSortieIso"
    >
  >,
  contacts: Contact[],
  investissements: Investissement[]
): PlacementImportPreviewLine[] {
  const withPatch = lines.map((line) =>
    line.lineKey === lineKey ? mergePlacementPreviewPatch(line, patch) : line
  );
  const seenInFile = buildPlacementPreviewSeenInFileFromLines(withPatch);
  return withPatch.map((line) =>
    line.status === "imported"
      ? line
      : reassessPlacementPreviewLine(line, contacts, investissements, seenInFile)
  );
}

export function buildPlacementPreviewSeenInFile(
  rows: PlacementCommandeRow[]
): Map<string, number> {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = businessLineKey(row);
    if (!seen.has(key)) seen.set(key, row.rowIndex);
  }
  return seen;
}

export function buildPlacementCommandesImportPreview(
  rows: PlacementCommandeRow[],
  contacts: Contact[],
  investissements: Investissement[]
): PlacementImportPreviewLine[] {
  const seenInFile = new Map<string, number>();

  return rows.map((row) => {
    const lineKey = `row-${row.rowIndex}`;
    const contact = resolveContactForPlacementImport(
      contacts,
      row.investorNom,
      row.investorPrenom,
      row.investorEmail
    );

    const hasCo = !!(row.coInvestorNom && row.coInvestorPrenom);
    let coContact: Contact | undefined;
    if (hasCo) {
      coContact = resolveContactForPlacementImport(
        contacts,
        row.coInvestorNom!,
        row.coInvestorPrenom!,
        row.coInvestorEmail
      );
    }

    const contactLabel = contact
      ? `${contact.prenom} ${contact.nom}`
      : `${row.investorPrenom} ${row.investorNom}`;
    const coContactLabel =
      hasCo && coContact
        ? `${coContact.prenom} ${coContact.nom}`
        : hasCo
          ? `${row.coInvestorPrenom} ${row.coInvestorNom}`
          : undefined;

    let foyerId: number | undefined;
    if (contact && coContact?.foyer_id && contact.foyer_id === coContact.foyer_id) {
      foyerId = contact.foyer_id;
    }

    const bizKey = businessLineKey(row);
    const duplicateCsvRowIndex = seenInFile.has(bizKey)
      ? seenInFile.get(bizKey)
      : undefined;
    if (!duplicateCsvRowIndex) seenInFile.set(bizKey, row.rowIndex);

    let existing: Investissement | undefined;
    let ambiguous: boolean | undefined;
    if (contact) {
      ({ match: existing, ambiguous } = findExistingPlacementInvestissementForPreview(
        investissements,
        contact,
        coContact,
        row
      ));
    }

    return assessPlacementImportLine(row, lineKey, {
      contact,
      coContact,
      contactLabel,
      coContactLabel,
      foyerId,
      duplicateCsvRowIndex,
      existing,
      ambiguous,
    });
  });
}

export function summarizePlacementImportPreview(
  lines: PlacementImportPreviewLine[]
): PlacementImportPreviewSummary {
  const count = (status: PlacementImportLineStatus) =>
    lines.filter((l) => l.status === status).length;
  return {
    total: lines.length,
    ready: count("ready"),
    review: count("review"),
    invalid: count("invalid"),
    contactNotFound: count("contact_not_found"),
    coContactNotFound: count("co_contact_not_found"),
    duplicateCrm: count("duplicate_crm"),
    duplicateCsv: count("duplicate_csv"),
    imported: count("imported"),
  };
}

export function isPlacementImportLineSelectable(line: PlacementImportPreviewLine): boolean {
  if (line.status === "ready" || line.status === "review") return true;
  if (line.status === "duplicate_crm" && line.investissementId != null) return true;
  return false;
}

export function defaultSelectedPlacementLineKeys(
  lines: PlacementImportPreviewLine[]
): Set<string> {
  return new Set(lines.filter(isPlacementImportLineSelectable).map((l) => l.lineKey));
}

function isPlacementImportLineApplicable(line: PlacementImportPreviewLine): boolean {
  if (!line.contactId || !line.dateEffetIso) return false;
  return isPlacementImportLineSelectable(line);
}

export type PlacementImportPreviewSection = {
  status: PlacementImportLineStatus;
  label: string;
  lines: PlacementImportPreviewLine[];
};

export const PLACEMENT_IMPORT_PREVIEW_SECTION_ORDER: ReadonlyArray<{
  status: PlacementImportLineStatus;
  label: string;
}> = [
  { status: "ready", label: "À importer" },
  { status: "review", label: "À vérifier" },
  { status: "contact_not_found", label: "Investisseur introuvable" },
  { status: "co_contact_not_found", label: "Co-investisseur introuvable" },
  { status: "duplicate_crm", label: "Déjà en base" },
  { status: "duplicate_csv", label: "Doublon fichier" },
  { status: "invalid", label: "Invalide" },
  { status: "imported", label: "Importé" },
];

export function groupPlacementPreviewLines(
  lines: PlacementImportPreviewLine[]
): PlacementImportPreviewSection[] {
  const byStatus = new Map<PlacementImportLineStatus, PlacementImportPreviewLine[]>();
  for (const line of lines) {
    const bucket = byStatus.get(line.status) ?? [];
    bucket.push(line);
    byStatus.set(line.status, bucket);
  }
  return PLACEMENT_IMPORT_PREVIEW_SECTION_ORDER.map((section) => ({
    ...section,
    lines: (byStatus.get(section.status) ?? []).sort((a, b) => a.rowIndex - b.rowIndex),
  })).filter((section) => section.lines.length > 0);
}

export function formatPlacementProduitLabel(line: PlacementImportPreviewLine): string {
  if (line.typeProduit === "ASSURANCE_VIE") return `${line.nomProduit} (AV)`;
  if (line.typeProduit === "PER") return `${line.nomProduit} (PER)`;
  if (line.typeProduit === "CONTRAT_CAPITALISATION") return `${line.nomProduit} (Cap.)`;
  if (line.typeProduit === "SCPI") return `${line.nomProduit} (SCPI)`;
  if (line.typeProduit === "FIP_FCPI") return `${line.nomProduit} (FIP)`;
  if (line.typeProduit === "G3F") return `${line.nomProduit} (G3F)`;
  return line.nomProduit;
}

export type PlacementCrmDiffHighlightField =
  | "nomProduit"
  | "typeProduit"
  | "montantCentimes"
  | "montantVpCentimes"
  | "frequenceVp"
  | "dateEffetIso"
  | "dateSortieIso"
  | "numeroContrat"
  | "reinvestissementDividendes"
  | "pourcentageReinvestissement";

export type PlacementCrmDiffFieldHighlight = "fill" | "change";
export type PlacementCrmDiffFieldHighlights = Partial<
  Record<PlacementCrmDiffHighlightField, PlacementCrmDiffFieldHighlight>
>;

function parsePlacementReinvestPctFromNotes(notes?: string | null): number | undefined {
  const match = notes?.match(/Réinv\.\s*(\d+)\s*%/);
  if (!match?.[1]) return undefined;
  const pct = Number.parseInt(match[1], 10);
  return Number.isFinite(pct) ? pct : undefined;
}

function markPlacementCrmDiff(
  highlights: PlacementCrmDiffFieldHighlights,
  field: PlacementCrmDiffHighlightField,
  fileValue: string | number | boolean | undefined | null,
  crmValue: string | number | boolean | undefined | null
): void {
  if (fileValue == null || fileValue === "" || fileValue === false) return;
  const incoming = String(fileValue).trim();
  const prev = crmValue == null || crmValue === false ? "" : String(crmValue).trim();
  if (!incoming || incoming === prev) return;
  highlights[field] = prev ? "change" : "fill";
}

/** Écarts fichier vs investissement CRM (aperçu « Déjà en base »). */
export function getPlacementCrmDiffFieldHighlights(
  line: PlacementImportPreviewLine,
  existing: Investissement
): PlacementCrmDiffFieldHighlights {
  const highlights: PlacementCrmDiffFieldHighlights = {};

  markPlacementCrmDiff(highlights, "typeProduit", line.typeProduit, existing.type_produit);
  if (!placementNomProduitMatches(line.nomProduit, existing.nom_produit)) {
    markPlacementCrmDiff(highlights, "nomProduit", line.nomProduit, existing.nom_produit);
  }
  markPlacementCrmDiff(
    highlights,
    "montantCentimes",
    line.montantCentimes,
    existing.montant_initial ?? 0
  );
  markPlacementCrmDiff(highlights, "numeroContrat", line.numeroContrat, existing.numero_contrat);

  const fileDate = isoToDateInput(line.dateEffetIso);
  const crmDate = existing.date_souscription
    ? unixToDateInput(existing.date_souscription)
    : "";
  if (fileDate && fileDate !== crmDate) {
    highlights.dateEffetIso = crmDate ? "change" : "fill";
  }

  if (line.versementProgramme && line.montantVpCentimes != null) {
    markPlacementCrmDiff(
      highlights,
      "montantVpCentimes",
      line.montantVpCentimes,
      existing.montant_versement_programme ?? 0
    );
    markPlacementCrmDiff(highlights, "frequenceVp", line.frequenceVp, existing.frequence_versement);
  }

  if (line.reinvestissementDividendes) {
    const crmPct = parsePlacementReinvestPctFromNotes(existing.notes);
    const filePct = line.pourcentageReinvestissement ?? 100;
    if (!existing.reinvestissement_dividendes) {
      highlights.reinvestissementDividendes = "fill";
    }
    if (filePct !== (crmPct ?? 100)) {
      highlights.pourcentageReinvestissement = crmPct != null ? "change" : "fill";
    }
  }

  if (line.etatCommande === "CLOSE" && line.dateSortieIso) {
    const fileClose = isoToDateInput(line.dateSortieIso);
    const crmClose = existing.date_cloture ? unixToDateInput(existing.date_cloture) : "";
    if (fileClose && fileClose !== crmClose) {
      highlights.dateSortieIso = crmClose ? "change" : "fill";
    }
  }

  return highlights;
}

async function ensureFoyerForCoInvestors(
  contact1: Contact,
  contact2: Contact,
  foyersCache: Foyer[]
): Promise<number> {
  if (contact1.foyer_id && contact1.foyer_id === contact2.foyer_id) {
    return contact1.foyer_id;
  }

  const compositeNom = buildFoyerNomFromMembers([contact1, contact2])
    .replace(/^Foyer\s+/i, "")
    .trim();

  let foyer = findExistingFoyerByFamilleName(foyersCache, compositeNom);

  if (!foyer) {
    foyer = await createFoyer({
      nom: buildFoyerNomFromMembers([contact1, contact2]),
      type_foyer: "COUPLE",
    });
    foyersCache.push(foyer);
  }

  if (contact1.foyer_id !== foyer.id) {
    await linkContactToFoyer(contact1, foyer.id, "DECLARANT_1", IMPORT_SAVE_OPTS);
    contact1.foyer_id = foyer.id;
  }
  if (contact2.foyer_id !== foyer.id) {
    await linkContactToFoyer(contact2, foyer.id, "DECLARANT_2", IMPORT_SAVE_OPTS);
    contact2.foyer_id = foyer.id;
  }

  return foyer.id;
}

async function promoteContactToClient(contact: Contact): Promise<void> {
  if (contact.categorie === "CLIENT" || !contact.id) return;
  await updateContact(
    contact.id,
    contactToUpdatePayload(contact, { categorie: "CLIENT" }),
    IMPORT_SAVE_OPTS
  );
}

async function resolvePartenaireId(
  partenaireNom: string,
  typeProduit: string,
  cache: Partenaire[]
): Promise<number | undefined> {
  if (!partenaireNom.trim()) return undefined;
  let partenaire = findMatchingPartenaire(partenaireNom, cache);
  if (!partenaire) {
    const created = await createPartenaire({
      type_partenaire: deduireTypePartenaire(typeProduit),
      raison_sociale: partenaireNom.trim(),
    } satisfies NewPartenaire);
    cache.push(created);
    partenaire = created;
  }
  return partenaire.id;
}

function buildInvestissementPayload(
  line: PlacementImportPreviewLine,
  owner: { contactId?: number; foyerId?: number },
  partenaireId?: number
): NewInvestissement {
  const notes =
    line.reinvestissementDividendes && line.pourcentageReinvestissement
      ? formatPlacementReinvestNotes(line.pourcentageReinvestissement)
      : undefined;
  return {
    contact_id: owner.contactId,
    foyer_id: owner.foyerId,
    type_produit: line.typeProduit,
    partenaire_id: partenaireId,
    nom_produit: line.nomProduit,
    numero_contrat: line.numeroContrat,
    montant_initial: line.montantCentimes,
    date_souscription: line.dateEffetIso,
    versement_programme: line.versementProgramme,
    montant_versement_programme: line.montantVpCentimes,
    frequence_versement: line.frequenceVp,
    origine: "MON_CONSEIL",
    reinvestissement_dividendes: line.reinvestissementDividendes ?? false,
    notes,
  };
}

export type ApplyPlacementImportResult =
  | { ok: true; line: PlacementImportPreviewLine; investissementId: number }
  | { ok: false; reason: "invalid" | "error" };

export async function applyPlacementCommandeImportLine(
  line: PlacementImportPreviewLine,
  ctx?: {
    contactsCache?: Contact[];
    foyersCache?: Foyer[];
    investissementsCache?: Investissement[];
    partenairesCache?: Partenaire[];
  }
): Promise<ApplyPlacementImportResult> {
  if (!isPlacementImportLineApplicable(line)) {
    return { ok: false, reason: "invalid" };
  }

  const wasEnrich = line.status === "duplicate_crm";

  try {
    const contacts = ctx?.contactsCache ?? (await getAllContacts());
    const foyers = ctx?.foyersCache ?? (await getAllFoyers());
    const investissements = ctx?.investissementsCache ?? (await getAllInvestissements());
    const partenaires = ctx?.partenairesCache ?? (await getAllPartenaires());

    const contact = contacts.find((c) => c.id === line.contactId);
    if (!contact) return { ok: false, reason: "error" };

    let foyerId: number | undefined;
    let contactId: number | undefined;

    if (line.coContactId) {
      const coContact = contacts.find((c) => c.id === line.coContactId);
      if (!coContact) return { ok: false, reason: "error" };
      foyerId = await ensureFoyerForCoInvestors(contact, coContact, foyers);
      await promoteContactToClient(contact);
      await promoteContactToClient(coContact);
    } else {
      contactId = contact.id;
      await promoteContactToClient(contact);
    }

    const partenaireId = await resolvePartenaireId(
      line.partenaireNom,
      line.typeProduit,
      partenaires
    );

    const payload = buildInvestissementPayload(
      line,
      { contactId, foyerId },
      partenaireId
    );

    const existing =
      wasEnrich && line.investissementId
        ? investissements.find((i) => i.id === line.investissementId)
        : findExistingPlacementInvestissement(investissements, line, { contactId, foyerId })
            .match;

    let saved: Investissement;
    if (existing) {
      saved = await updateInvestissement(existing.id, payload, IMPORT_SAVE_OPTS);
      const idx = investissements.findIndex((i) => i.id === existing.id);
      if (idx !== -1) investissements[idx] = saved;
    } else {
      saved = await createInvestissement(payload, IMPORT_SAVE_OPTS);
      investissements.push(saved);
    }

    if (line.etatCommande === "CLOSE" && line.dateSortieIso) {
      saved = await closeInvestissement(saved.id, {
        date_cloture: line.dateSortieIso,
      });
      const idx = investissements.findIndex((i) => i.id === saved.id);
      if (idx !== -1) investissements[idx] = saved;
    }

    return {
      ok: true,
      investissementId: saved.id,
      line: {
        ...line,
        status: "imported",
        statusMessage: wasEnrich
          ? "Enrichi"
          : line.etatCommande === "CLOSE"
            ? "Importé et clôturé (sortie encours)"
            : existing
              ? "Investissement mis à jour"
              : "Investissement créé",
        investissementId: saved.id,
        foyerId,
        partenaireId,
      },
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function applyPlacementCommandesImport(
  lines: PlacementImportPreviewLine[],
  selectedLineKeys: ReadonlySet<string>
): Promise<{ applied: number; failed: number; lines: PlacementImportPreviewLine[] }> {
  const contactsCache = await getAllContacts();
  const foyersCache = await getAllFoyers();
  const investissementsCache = await getAllInvestissements();
  const partenairesCache = await getAllPartenaires();
  let applied = 0;
  let failed = 0;
  const updated = [...lines];

  for (let i = 0; i < updated.length; i++) {
    const line = updated[i]!;
    if (!isPlacementImportLineSelectable(line) || !selectedLineKeys.has(line.lineKey)) {
      continue;
    }
    const result = await applyPlacementCommandeImportLine(line, {
      contactsCache,
      foyersCache,
      investissementsCache,
      partenairesCache,
    });
    if (result.ok) {
      updated[i] = result.line;
      applied += 1;
    } else {
      failed += 1;
    }
  }

  if (applied > 0) {
    notifyInvestissementsChanged();
    notifyContactsChanged();
  }
  return { applied, failed, lines: updated };
}

export const PLACEMENT_COMMANDES_SHEET_NAME = "Investissement Placement";

export function pickPlacementCommandesSheetName(
  sheetNames: string[]
): string | undefined {
  if (sheetNames.length === 0) return undefined;
  const exact = sheetNames.find(
    (name) =>
      normalizeHeader(name) === normalizeHeader(PLACEMENT_COMMANDES_SHEET_NAME)
  );
  return exact ?? sheetNames[0];
}
