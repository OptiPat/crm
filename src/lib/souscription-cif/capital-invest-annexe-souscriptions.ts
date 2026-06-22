import { formatEuroAmountCif, parseEuroInput } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import { parsePercentInput } from "@/lib/souscription-cif/scpi-annexe-souscriptions";

export type CapitalInvestAnnexeType = "fcpr" | "fcpi" | "fpci" | "fip" | "fip-outre-mer";

export type CapitalInvestAnnexeSouscription = {
  id: string;
  nomFonds: string;
  type: CapitalInvestAnnexeType;
  /** Nombre de parts souscrites (entier). */
  nbParts: string;
  partPriceEur: string;
  /** Droit d'entrée (0–100). Défaut 5 %. Appliqué sur le montant parts × prix. */
  droitEntreePct: string;
  /** Millésime — affichage formulaire uniquement. */
  millesime: string;
  /** Coefficient EMT fichier (ligne 07110, ex. 0,005). Distinct du droit d'entrée. */
  emtLine07110Pct: string;
  /** Coefficient EMT fichier (ligne 07130). */
  emtLine07130Pct: string;
  /** Coefficient EMT fichier (ligne 07140). */
  emtLine07140Pct: string;
};

export const DEFAULT_CAPITAL_INVEST_DROIT_ENTREE_PCT = "5";

export const CAPITAL_INVEST_TYPE_OPTIONS: ReadonlyArray<{
  value: CapitalInvestAnnexeType;
  label: string;
}> = [
  { value: "fcpr", label: "FCPR" },
  { value: "fcpi", label: "FCPI" },
  { value: "fpci", label: "FPCI" },
  { value: "fip", label: "FIP" },
  { value: "fip-outre-mer", label: "FIP Outre-Mer" },
];

const CAPITAL_INVEST_TYPE_SET = new Set<string>(CAPITAL_INVEST_TYPE_OPTIONS.map((o) => o.value));

/** Complément après « La souscription de parts … » (article inclus). */
const CAPITAL_INVEST_FUND_PHRASE_BY_TYPE: Record<CapitalInvestAnnexeType, string> = {
  fcpr: "du FCPR",
  fcpi: "du FCPI",
  fpci: "du FPCI",
  fip: "du FIP",
  "fip-outre-mer": "du FIP Outre-Mer",
};

/** Identifiant stable et unique par ligne (évite les collisions après rechargement). */
export function allocateCapitalInvestRowId(existing: readonly { id: string }[]): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `ci-${crypto.randomUUID()}`;
  }
  const used = new Set(existing.map((row) => row.id));
  let n = 1;
  while (used.has(`ci-${n}`)) n += 1;
  return `ci-${n}`;
}

export function ensureUniqueCapitalInvestAnnexeSouscriptionIds(
  rows: readonly CapitalInvestAnnexeSouscription[]
): CapitalInvestAnnexeSouscription[] {
  const used = new Set<string>();
  const normalized: CapitalInvestAnnexeSouscription[] = [];
  for (const row of rows) {
    if (row.id && !used.has(row.id)) {
      used.add(row.id);
      normalized.push(row);
      continue;
    }
    const id = allocateCapitalInvestRowId([...used].map((existingId) => ({ id: existingId })));
    used.add(id);
    normalized.push({ ...row, id });
  }
  return normalized;
}

export function parseNbPartsInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalizeCapitalInvestAnnexeType(raw: unknown): CapitalInvestAnnexeType {
  return typeof raw === "string" && CAPITAL_INVEST_TYPE_SET.has(raw)
    ? (raw as CapitalInvestAnnexeType)
    : "fcpi";
}

/** Montant souscrit hors droit d'entrée = nb parts × prix de part. */
export function computeCapitalInvestMontantSouscrit(
  row: Pick<CapitalInvestAnnexeSouscription, "nbParts" | "partPriceEur">
): number | null {
  const nbParts = parseNbPartsInput(row.nbParts);
  const partPrice = parseEuroInput(row.partPriceEur);
  if (nbParts == null || partPrice == null || partPrice <= 0) return null;
  return nbParts * partPrice;
}

export function computeCapitalInvestDroitEntreeEur(
  row: Pick<CapitalInvestAnnexeSouscription, "nbParts" | "partPriceEur" | "droitEntreePct">
): number | null {
  const montant = computeCapitalInvestMontantSouscrit(row);
  if (montant == null) return null;
  const pct =
    parsePercentInput(row.droitEntreePct) ??
    parsePercentInput(DEFAULT_CAPITAL_INVEST_DROIT_ENTREE_PCT) ??
    5;
  return (montant * pct) / 100;
}

/** Total versé par le client (montant + droit d'entrée). */
export function computeCapitalInvestTotalVerse(
  row: Pick<CapitalInvestAnnexeSouscription, "nbParts" | "partPriceEur" | "droitEntreePct">
): number | null {
  const montant = computeCapitalInvestMontantSouscrit(row);
  const droitEntree = computeCapitalInvestDroitEntreeEur(row);
  if (montant == null || droitEntree == null) return null;
  return montant + droitEntree;
}

function deriveNbPartsFromLegacyMontant(
  montantSouscritEur: unknown,
  partPriceEur: unknown
): string {
  if (typeof montantSouscritEur !== "string" || typeof partPriceEur !== "string") return "";
  const montant = parseEuroInput(montantSouscritEur);
  const partPrice = parseEuroInput(partPriceEur);
  if (montant == null || partPrice == null || partPrice <= 0) return "";
  const nbParts = Math.round(montant / partPrice);
  if (nbParts <= 0) return "";
  if (Math.abs(montant - nbParts * partPrice) > 1e-6) return "";
  return String(nbParts);
}

export function newCapitalInvestAnnexeSouscription(
  partial?: Partial<Omit<CapitalInvestAnnexeSouscription, "id">> & { id?: string },
  existingRows: readonly { id: string }[] = []
): CapitalInvestAnnexeSouscription {
  return {
    id: partial?.id ?? allocateCapitalInvestRowId(existingRows),
    nomFonds: partial?.nomFonds ?? "",
    type: normalizeCapitalInvestAnnexeType(partial?.type),
    nbParts: partial?.nbParts ?? "",
    partPriceEur: partial?.partPriceEur ?? "",
    droitEntreePct: partial?.droitEntreePct?.trim()
      ? partial.droitEntreePct
      : DEFAULT_CAPITAL_INVEST_DROIT_ENTREE_PCT,
    millesime: partial?.millesime ?? "",
    emtLine07110Pct: partial?.emtLine07110Pct ?? "",
    emtLine07130Pct: partial?.emtLine07130Pct ?? "",
    emtLine07140Pct: partial?.emtLine07140Pct ?? "",
  };
}

export function normalizeCapitalInvestAnnexeSouscriptions(raw: unknown): CapitalInvestAnnexeSouscription[] {
  if (!Array.isArray(raw)) return [];
  const rows: CapitalInvestAnnexeSouscription[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Partial<CapitalInvestAnnexeSouscription> & { montantSouscritEur?: string };
    const partPriceEur = typeof o.partPriceEur === "string" ? o.partPriceEur : "";
    let nbParts = typeof o.nbParts === "string" ? o.nbParts : "";
    if (!nbParts.trim()) {
      nbParts = deriveNbPartsFromLegacyMontant(o.montantSouscritEur, partPriceEur);
    }
    rows.push(
      newCapitalInvestAnnexeSouscription(
        {
          id: typeof o.id === "string" && o.id.trim() ? o.id : undefined,
          nomFonds: typeof o.nomFonds === "string" ? o.nomFonds : "",
          type: o.type,
          nbParts,
          partPriceEur,
          droitEntreePct:
            typeof o.droitEntreePct === "string"
              ? o.droitEntreePct
              : DEFAULT_CAPITAL_INVEST_DROIT_ENTREE_PCT,
          millesime: typeof o.millesime === "string" ? o.millesime : "",
          emtLine07110Pct: typeof o.emtLine07110Pct === "string" ? o.emtLine07110Pct : "",
          emtLine07130Pct: typeof o.emtLine07130Pct === "string" ? o.emtLine07130Pct : "",
          emtLine07140Pct: typeof o.emtLine07140Pct === "string" ? o.emtLine07140Pct : "",
        },
        rows
      )
    );
  }
  return ensureUniqueCapitalInvestAnnexeSouscriptionIds(rows);
}

export function sumMontantCapitalInvestFromSouscriptions(
  souscriptions: readonly CapitalInvestAnnexeSouscription[]
): number | null {
  let total = 0;
  let hasAny = false;
  for (const row of souscriptions) {
    const montant = computeCapitalInvestMontantSouscrit(row);
    if (montant == null) continue;
    total += montant;
    hasAny = true;
  }
  return hasAny ? total : null;
}

export function sumTotalVerseCapitalInvestFromSouscriptions(
  souscriptions: readonly CapitalInvestAnnexeSouscription[]
): number | null {
  let total = 0;
  let hasAny = false;
  for (const row of souscriptions) {
    const totalVerse = computeCapitalInvestTotalVerse(row);
    if (totalVerse == null) continue;
    total += totalVerse;
    hasAny = true;
  }
  return hasAny ? total : null;
}

/** Libellé produit dans la phrase « La souscription de parts … » */
export function formatCapitalInvestFundPhrase(
  type: CapitalInvestAnnexeType,
  nomFonds: string
): string | null {
  const name = nomFonds.trim();
  if (!name) return null;
  return `${CAPITAL_INVEST_FUND_PHRASE_BY_TYPE[type]} ${name}`;
}

function formatPercentCif(percent: number): string {
  const rounded = Math.round(percent * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
  return `${text} %`;
}

function buildCapitalInvestSouscriptionLine(row: CapitalInvestAnnexeSouscription): string | null {
  const fundPhrase = formatCapitalInvestFundPhrase(row.type, row.nomFonds);
  const nbParts = parseNbPartsInput(row.nbParts);
  const partPrice = parseEuroInput(row.partPriceEur);
  const montant = computeCapitalInvestMontantSouscrit(row);
  if (!fundPhrase || nbParts == null || partPrice == null || montant == null) return null;

  const montantFmt = formatEuroAmountCif(montant);
  const partPriceFmt = formatEuroAmountCif(partPrice);
  const droitEntree =
    parsePercentInput(row.droitEntreePct) ??
    parsePercentInput(DEFAULT_CAPITAL_INVEST_DROIT_ENTREE_PCT) ??
    5;
  const droitEntreeEur = computeCapitalInvestDroitEntreeEur(row);
  const droitEntreeSuffix =
    droitEntreeEur != null
      ? `Dont ${formatPercentCif(droitEntree)} de droit d'entrée, soit ${formatEuroAmountCif(droitEntreeEur)}.`
      : `Dont ${formatPercentCif(droitEntree)} de droit d'entrée.`;

  return `La souscription de parts ${fundPhrase} au comptant pour un montant de ${montantFmt}, soit ${partPriceFmt} la part x ${nbParts} parts = montant total souscrit de ${montantFmt}. ${droitEntreeSuffix}`;
}

/** Format type annexes Capital investissement (§ Mes préconisations). */
export function buildMesPreconisationsFromCapitalInvestSouscriptions(
  souscriptions: readonly CapitalInvestAnnexeSouscription[]
): string {
  const paragraphs = souscriptions
    .map((row) => buildCapitalInvestSouscriptionLine(row))
    .filter((p): p is string => p != null);

  if (paragraphs.length === 0) return "";

  const total = sumTotalVerseCapitalInvestFromSouscriptions(souscriptions);
  const intro =
    total != null
      ? `Mes préconisations portent sur un investissement global de ${formatEuroAmountCif(total)} (montants souscrits et droits d'entrée inclus), répartis ainsi :`
      : "Mes préconisations portent sur un investissement global, répartis ainsi :";

  return `${intro}\n\n${paragraphs.join("\n\n")}`;
}

export function patchCapitalInvestAnnexeSouscription<K extends keyof CapitalInvestAnnexeSouscription>(
  rows: readonly CapitalInvestAnnexeSouscription[],
  id: string,
  field: K,
  value: CapitalInvestAnnexeSouscription[K]
): CapitalInvestAnnexeSouscription[] {
  return rows.map((row) => (row.id === id ? { ...row, [field]: value } : row));
}

export function addCapitalInvestAnnexeSouscription(
  rows: readonly CapitalInvestAnnexeSouscription[],
  partial?: Partial<Omit<CapitalInvestAnnexeSouscription, "id">>
): CapitalInvestAnnexeSouscription[] {
  return [...rows, newCapitalInvestAnnexeSouscription(partial, rows)];
}

export function removeCapitalInvestAnnexeSouscription(
  rows: readonly CapitalInvestAnnexeSouscription[],
  id: string
): CapitalInvestAnnexeSouscription[] {
  return rows.filter((row) => row.id !== id);
}
