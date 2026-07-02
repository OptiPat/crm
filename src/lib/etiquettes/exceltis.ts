import {
  attribuerEtiquette,
  createEtiquette,
  getAllEtiquettes,
  type Etiquette,
} from "@/lib/api/tauri-etiquettes";
import { getAllTemplatesEmail } from "@/lib/api/tauri-templates-email";

const MOIS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

export const EXCELITIS_MONTH_OPTIONS = MOIS_FR.map((label, index) => ({
  value: index + 1,
  label,
}));

/** Préfixe legacy (étiquettes sans gamme). */
export const EXCELITIS_ETIQUETTE_PREFIX = "Exceltis — ";

/** Gammes proposées à la souscription. */
export const EXCELITIS_GAMMES = ["Rendement", "Sérénité", "Patrimoine"] as const;

export type ExceltisGamme = (typeof EXCELITIS_GAMMES)[number];

export const EXCELITIS_GAMME_OPTIONS: { value: ExceltisGamme; label: string }[] = [
  { value: "Rendement", label: "Rendement" },
  { value: "Sérénité", label: "Sérénité" },
  { value: "Patrimoine", label: "Patrimoine" },
];

/** Types de contrat éligibles à l'étiquette Exceltis à la souscription. */
export const EXCELITIS_ELIGIBLE_PRODUCT_TYPES = ["ASSURANCE_VIE", "PER"] as const;

export function isExceltisEligibleProductType(typeProduit: string): boolean {
  return (EXCELITIS_ELIGIBLE_PRODUCT_TYPES as readonly string[]).includes(typeProduit);
}

/** Modèle email par défaut (Suivi → Envois, campagnes Exceltis). */
export const EXCELITIS_EMAIL_TEMPLATE_NOM = "Exceltis — remboursement et arbitrage";

export interface ExceltisMillesime {
  month: number;
  year: number;
}

export interface ExceltisEtiquetteKey extends ExceltisMillesime {
  /** Absent sur les anciennes étiquettes « Exceltis — Mois Année ». */
  gamme?: ExceltisGamme;
}

/** Alias Stellium → libellé CRM (ex. « Patrimoine Taux » → Patrimoine). */
const GAMME_PARSE_ALIASES: readonly { pattern: string; gamme: ExceltisGamme }[] = [
  { pattern: "patrimoine taux", gamme: "Patrimoine" },
  { pattern: "sérénité", gamme: "Sérénité" },
  { pattern: "serenite", gamme: "Sérénité" },
  { pattern: "rendement", gamme: "Rendement" },
  { pattern: "patrimoine", gamme: "Patrimoine" },
];

const MONTH_SEARCH_KEYS: Record<number, readonly string[]> = {
  1: ["janvier"],
  2: ["février", "fevrier"],
  3: ["mars"],
  4: ["avril"],
  5: ["mai"],
  6: ["juin"],
  7: ["juillet"],
  8: ["août", "aout"],
  9: ["septembre"],
  10: ["octobre"],
  11: ["novembre"],
  12: ["décembre", "decembre"],
};

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function extractYearAfterMonth(text: string, monthKeyLen: number): number | null {
  const after = text.slice(monthKeyLen).trim();
  for (const word of after.split(/\s+/).slice(0, 4)) {
    const digits = word.replace(/\D/g, "");
    if (digits.length === 4) {
      const year = Number(digits);
      if (year >= 2015 && year <= 2100) {
        return year;
      }
    }
  }
  return null;
}

/** Extrait la gamme depuis un texte Stellium ou un nom d'étiquette. */
export function parseExceltisGammeFromText(text: string): ExceltisGamme | null {
  const normalized = normalizeForMatch(text);
  const aliases = [...GAMME_PARSE_ALIASES].sort((a, b) => b.pattern.length - a.pattern.length);
  for (const { pattern, gamme } of aliases) {
    if (normalized.includes(normalizeForMatch(pattern))) {
      return gamme;
    }
  }
  return null;
}

function findMillesimeInText(trimmed: string): { rank: number; month: number; year: number } | null {
  const lower = trimmed.toLowerCase();
  if (!lower.includes("exceltis")) {
    return null;
  }

  const exceltisPos = lower.indexOf("exceltis");
  let best: { rank: number; month: number; year: number } | null = null;

  for (let month = 1; month <= 12; month++) {
    for (const key of MONTH_SEARCH_KEYS[month] ?? []) {
      const pos = lower.indexOf(key);
      if (pos === -1 || pos < exceltisPos || pos > exceltisPos + 120) {
        continue;
      }
      const year = extractYearAfterMonth(trimmed.slice(pos), key.length);
      if (year == null) {
        continue;
      }
      if (!best || pos < best.rank) {
        best = { rank: pos, month, year };
      }
    }
  }

  return best;
}

/** Clé gamme + millésime depuis un nom d'étiquette ou un sujet Stellium. */
export function parseExceltisKeyFromNom(nom: string): ExceltisEtiquetteKey | null {
  const trimmed = nom.trim();
  const millesime = findMillesimeInText(trimmed);
  if (!millesime) {
    return null;
  }

  const exceltisPos = trimmed.toLowerCase().indexOf("exceltis");
  const fragment = trimmed.slice(exceltisPos + "exceltis".length, millesime.rank);
  const gamme =
    parseExceltisGammeFromText(fragment) ?? parseExceltisGammeFromText(trimmed) ?? undefined;

  return { gamme, month: millesime.month, year: millesime.year };
}

/** @deprecated Préférer parseExceltisKeyFromNom — millésime seul. */
export function parseExceltisMillesimeFromNom(nom: string): ExceltisMillesime | null {
  const key = parseExceltisKeyFromNom(nom);
  if (!key) {
    return null;
  }
  return { month: key.month, year: key.year };
}

/** Extrait « Février 2025 » depuis le nom d'étiquette. */
export function parseMillesimeLabelFromEtiquetteNom(nom: string): string | null {
  const parsed = parseExceltisKeyFromNom(nom);
  if (!parsed) {
    return null;
  }
  return formatMillesimeLabel(parsed.month, parsed.year);
}

export function isExceltisEtiquetteNom(nom: string): boolean {
  return parseExceltisKeyFromNom(nom) != null;
}

export function exceltisMillesimeMatches(
  a: ExceltisMillesime,
  b: ExceltisMillesime
): boolean {
  return a.month === b.month && a.year === b.year;
}

export function exceltisEtiquetteKeysMatch(
  a: ExceltisEtiquetteKey,
  b: ExceltisEtiquetteKey
): boolean {
  if (!exceltisMillesimeMatches(a, b)) {
    return false;
  }
  if (a.gamme && b.gamme) {
    return a.gamme === b.gamme;
  }
  if (!a.gamme && !b.gamme) {
    return true;
  }
  return false;
}

export interface ExceltisMillesimeOption {
  /** Clé stable ex. `2026-08` */
  key: string;
  /** Libellé affiché ex. `Août 2026` */
  label: string;
  month: number;
  year: number;
  offset: 1 | 2 | 3;
}

/** Nom d'étiquette canonique : Exceltis {Gamme} — {Mois} {Année}. */
export function formatExceltisEtiquetteNom(
  gamme: ExceltisGamme,
  month: number,
  year: number
): string {
  return `Exceltis ${gamme} — ${formatMillesimeLabel(month, year)}`;
}

export function formatMillesimeLabel(month: number, year: number): string {
  const name = MOIS_FR[month - 1];
  if (!name) {
    throw new Error(`Mois invalide: ${month}`);
  }
  return `${name} ${year}`;
}

function addCalendarMonths(base: Date, offset: number): { month: number; year: number } {
  const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

/**
 * Trois millésimes proposés à l'ouverture : M+1, M+2, M+3 par rapport au mois courant.
 */
export function getExceltisMillesimeProposals(
  referenceDate: Date = new Date()
): ExceltisMillesimeOption[] {
  return ([1, 2, 3] as const).map((offset) => {
    const { month, year } = addCalendarMonths(referenceDate, offset);
    return {
      key: `${year}-${String(month).padStart(2, "0")}`,
      label: formatMillesimeLabel(month, year),
      month,
      year,
      offset,
    };
  });
}

export async function findExceltisEtiquetteByKey(
  gamme: ExceltisGamme,
  month: number,
  year: number,
  etiquettes?: Etiquette[]
): Promise<Etiquette | undefined> {
  const target: ExceltisEtiquetteKey = { gamme, month, year };
  const list = etiquettes ?? (await getAllEtiquettes());
  return list.find((e) => {
    const parsed = parseExceltisKeyFromNom(e.nom);
    return parsed != null && exceltisEtiquetteKeysMatch(parsed, target);
  });
}

export interface ExceltisEtiquetteEnsureResult {
  nom: string;
  etiquette: Etiquette;
  created: boolean;
}

/** Crée l'étiquette Exceltis si absente (sans attribution contact). */
export async function ensureExceltisEtiquette(
  gamme: ExceltisGamme,
  month: number,
  year: number,
  etiquettes?: Etiquette[],
  rendementCible?: string | null
): Promise<ExceltisEtiquetteEnsureResult> {
  const nom = formatExceltisEtiquetteNom(gamme, month, year);
  const existing = await findExceltisEtiquetteByKey(gamme, month, year, etiquettes);
  if (existing) {
    return { nom: existing.nom, etiquette: existing, created: false };
  }

  const templates = await getAllTemplatesEmail();
  const emailTemplate = templates.find((t) => t.nom === EXCELITIS_EMAIL_TEMPLATE_NOM);
  const rendement = rendementCible?.trim() || null;
  const etiquette = await createEtiquette({
    nom,
    couleur: "#EAB308",
    description:
      "Clients avec position Exceltis sur ce millésime. Campagne email déclenchée à la réception du mail Stellium « Remboursement Exceltis ».",
    priorite: 50,
    actif: true,
    email_actif: false,
    email_template_id: emailTemplate?.id ?? null,
    auto_condition_type: null,
    auto_condition_config: null,
    auto_categories: null,
    rendement_cible: rendement,
  });
  return { nom, etiquette, created: true };
}

/** Crée l'étiquette si absente, puis l'attribue en MANUEL (sans retirer les autres). */
export async function ensureExceltisEtiquetteAndAssign(
  contactId: number,
  option: ExceltisMillesimeOption,
  gamme: ExceltisGamme
): Promise<string> {
  const { nom, etiquette } = await ensureExceltisEtiquette(
    gamme,
    option.month,
    option.year
  );
  await attribuerEtiquette(contactId, etiquette.id, "MANUEL");
  return nom;
}
