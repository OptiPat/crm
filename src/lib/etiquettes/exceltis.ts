import {
  attribuerEtiquette,
  createEtiquette,
  getAllEtiquettes,
  getEtiquetteAction,
  setEtiquetteAction,
  type Etiquette,
  type NewEtiquette,
} from "@/lib/api/tauri-etiquettes";
import { setEtiquettePipelineActif } from "@/lib/api/tauri-pipeline";
import { getAllTemplatesEmail } from "@/lib/api/tauri-templates-email";

const EXCELITIS_DEFAULT_DESCRIPTION =
  "Clients avec position Exceltis sur ce millésime. Campagne email déclenchée à la réception du mail Stellium « Remboursement Exceltis ».";

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

export interface ExceltisCatalogueMatch {
  etiquetteId: number;
  nom: string;
  gamme?: ExceltisGamme;
}

/** Millésime M+N enrichi avec l'étiquette catalogue et la pose contact éventuelle. */
export interface ExceltisMillesimeProposalView extends ExceltisMillesimeOption {
  catalogueMatches: ExceltisCatalogueMatch[];
  /** Gammes déjà posées sur le contact pour ce millésime. */
  contactGammes: Partial<Record<ExceltisGamme, true>>;
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

function catalogueMatchesForMillesime(
  etiquettes: Etiquette[],
  month: number,
  year: number
): ExceltisCatalogueMatch[] {
  return etiquettes.flatMap((etiquette) => {
    const parsed = parseExceltisKeyFromNom(etiquette.nom);
    if (parsed == null || parsed.month !== month || parsed.year !== year) {
      return [];
    }
    return [
      {
        etiquetteId: etiquette.id,
        nom: etiquette.nom,
        gamme: parsed.gamme,
      },
    ];
  });
}

function contactGammesForMillesime(
  contactEtiquettes: readonly { etiquette_nom: string }[],
  month: number,
  year: number
): Partial<Record<ExceltisGamme, true>> {
  const gammes: Partial<Record<ExceltisGamme, true>> = {};
  for (const liaison of contactEtiquettes) {
    const parsed = parseExceltisKeyFromNom(liaison.etiquette_nom);
    if (parsed == null || parsed.month !== month || parsed.year !== year) {
      continue;
    }
    if (parsed.gamme) {
      gammes[parsed.gamme] = true;
    }
  }
  return gammes;
}

/** M+1…M+3 avec étiquettes catalogue existantes et pose contact. */
export function buildExceltisFormProposals(
  etiquettes: Etiquette[],
  contactEtiquettes: readonly { etiquette_nom: string }[],
  referenceDate: Date = new Date()
): ExceltisMillesimeProposalView[] {
  return getExceltisMillesimeProposals(referenceDate).map((option) => ({
    ...option,
    catalogueMatches: catalogueMatchesForMillesime(etiquettes, option.month, option.year),
    contactGammes: contactGammesForMillesime(
      contactEtiquettes,
      option.month,
      option.year
    ),
  }));
}

function defaultGammeFromCatalogue(
  proposal: ExceltisMillesimeProposalView
): ExceltisGamme {
  const withGamme = proposal.catalogueMatches.find((m) => m.gamme != null)?.gamme;
  if (withGamme) {
    return withGamme;
  }
  const onContact = EXCELITIS_GAMMES.find((g) => proposal.contactGammes[g]);
  return onContact ?? "Rendement";
}

/** Pré-sélection si le contact a déjà une étiquette Exceltis dans la fenêtre M+1…M+3. */
export function inferExceltisFormChoice(
  proposals: ExceltisMillesimeProposalView[]
): { hasExceltis: false } | { hasExceltis: true; gamme: ExceltisGamme; millesimeKey: string } {
  for (const proposal of proposals) {
    if (Object.keys(proposal.contactGammes).length === 0) {
      continue;
    }
    const gamme =
      EXCELITIS_GAMMES.find((g) => proposal.contactGammes[g]) ??
      defaultGammeFromCatalogue(proposal);
    return { hasExceltis: true, gamme, millesimeKey: proposal.key };
  }

  return { hasExceltis: false };
}

export function contactHasExceltisAssignment(
  contactEtiquettes: readonly { etiquette_nom: string }[],
  gamme: ExceltisGamme,
  option: Pick<ExceltisMillesimeOption, "month" | "year">
): boolean {
  const target: ExceltisEtiquetteKey = { gamme, month: option.month, year: option.year };
  return contactEtiquettes.some((liaison) => {
    const parsed = parseExceltisKeyFromNom(liaison.etiquette_nom);
    return parsed != null && exceltisEtiquetteKeysMatch(parsed, target);
  });
}

export function catalogueHasExceltisEtiquette(
  proposals: ExceltisMillesimeProposalView[],
  gamme: ExceltisGamme,
  millesimeKey: string
): boolean {
  const proposal = proposals.find((p) => p.key === millesimeKey);
  if (!proposal) {
    return false;
  }
  return findCatalogueMatchForGamme(proposal, gamme) != null;
}

export function findCatalogueMatchForGamme(
  proposal: ExceltisMillesimeProposalView,
  gamme: ExceltisGamme
): ExceltisCatalogueMatch | undefined {
  return proposal.catalogueMatches.find((match) => match.gamme === gamme);
}

export function contactHasGammeForProposal(
  proposal: ExceltisMillesimeProposalView,
  gamme: ExceltisGamme
): boolean {
  return proposal.contactGammes[gamme] === true;
}

export async function findExceltisEtiquetteByKey(
  gamme: ExceltisGamme,
  month: number,
  year: number,
  etiquettes?: Etiquette[]
): Promise<Etiquette | undefined> {
  const list = etiquettes ?? (await getAllEtiquettes());
  return findExceltisEtiquetteInList(gamme, month, year, list);
}

export function findExceltisEtiquetteInList(
  gamme: ExceltisGamme,
  month: number,
  year: number,
  etiquettes: Etiquette[]
): Etiquette | undefined {
  const target: ExceltisEtiquetteKey = { gamme, month, year };
  return etiquettes.find((e) => {
    const parsed = parseExceltisKeyFromNom(e.nom);
    return parsed != null && exceltisEtiquetteKeysMatch(parsed, target);
  });
}

/** Premier millésime M+1…M+3 sans étiquette catalogue pour la gamme. */
export function resolveCreatableExceltisMillesime(
  gamme: ExceltisGamme,
  etiquettes: Etiquette[],
  referenceDate: Date = new Date()
): ExceltisMillesimeOption | undefined {
  return getExceltisMillesimeProposals(referenceDate).find(
    (option) => findExceltisEtiquetteInList(gamme, option.month, option.year, etiquettes) == null
  );
}

export interface ExceltisEtiquetteEnsureResult {
  nom: string;
  etiquette: Etiquette;
  created: boolean;
  /** Paramétrage copié depuis une étiquette Exceltis existante. */
  clonedFrom?: string;
}

/** Dernière étiquette Exceltis à cloner (même gamme prioritaire, puis millésime le plus récent). */
export function findLatestExceltisEtiquetteForClone(
  etiquettes: Etiquette[],
  gamme: ExceltisGamme
): Etiquette | undefined {
  const candidates = etiquettes
    .map((etiquette) => {
      const key = parseExceltisKeyFromNom(etiquette.nom);
      if (key == null) {
        return null;
      }
      return {
        etiquette,
        key,
        sameGamme: key.gamme === gamme ? 1 : 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item != null);

  if (candidates.length === 0) {
    return undefined;
  }

  candidates.sort((a, b) => {
    if (b.sameGamme !== a.sameGamme) {
      return b.sameGamme - a.sameGamme;
    }
    if (b.key.year !== a.key.year) {
      return b.key.year - a.key.year;
    }
    if (b.key.month !== a.key.month) {
      return b.key.month - a.key.month;
    }
    return b.etiquette.created_at - a.etiquette.created_at;
  });

  return candidates[0]?.etiquette;
}

/** Payload création — reprend campagne / rendement depuis un modèle si présent. */
export function buildNewExceltisEtiquettePayload(
  nom: string,
  template: Etiquette | undefined,
  fallbackEmailTemplateId: number | null,
  rendementCible?: string | null
): NewEtiquette {
  const rendement =
    rendementCible?.trim() || template?.rendement_cible?.trim() || null;

  if (template) {
    return {
      nom,
      couleur: template.couleur,
      description: template.description ?? EXCELITIS_DEFAULT_DESCRIPTION,
      priorite: template.priorite,
      actif: true,
      email_actif: template.email_actif,
      email_template_id: template.email_template_id ?? fallbackEmailTemplateId,
      email_delai_jours: template.email_delai_jours,
      email_envoi_prevu: template.email_envoi_prevu,
      email_envoi_heure: template.email_envoi_heure,
      email_envoi_jours_semaine: template.email_envoi_jours_semaine,
      auto_condition_type: null,
      auto_condition_config: null,
      auto_categories: null,
      rendement_cible: rendement,
    };
  }

  return {
    nom,
    couleur: "#EAB308",
    description: EXCELITIS_DEFAULT_DESCRIPTION,
    priorite: 50,
    actif: true,
    email_actif: false,
    email_template_id: fallbackEmailTemplateId,
    auto_condition_type: null,
    auto_condition_config: null,
    auto_categories: null,
    rendement_cible: rendement,
  };
}

async function cloneExceltisEtiquetteSidecar(
  template: Etiquette,
  newEtiquetteId: number,
  newNom: string,
  gamme: ExceltisGamme,
  month: number,
  year: number
): Promise<void> {
  const action = await getEtiquetteAction(template.id);
  if (action) {
    await setEtiquetteAction({
      ...action,
      etiquette_id: newEtiquetteId,
      tache_titre: adaptExceltisTacheTitreForClone(
        action.tache_titre,
        template,
        newNom,
        gamme,
        month,
        year
      ),
    });
  }
  if (template.pipeline_actif) {
    await setEtiquettePipelineActif(newEtiquetteId, true);
  }
}

/** Remplace le millésime (et le nom d'étiquette) dans un titre de tâche cloné. */
export function adaptExceltisTacheTitreForClone(
  titre: string | null | undefined,
  templateEtiquette: Etiquette | undefined,
  newNom: string,
  gamme: ExceltisGamme,
  _month: number,
  _year: number
): string | null {
  const trimmed = titre?.trim();
  if (!trimmed) {
    return null;
  }

  let next = trimmed;
  if (templateEtiquette) {
    if (next.includes(templateEtiquette.nom)) {
      return next.replace(templateEtiquette.nom, newNom);
    }
    const templateKey = parseExceltisKeyFromNom(templateEtiquette.nom);
    if (templateKey) {
      const oldMillesime = formatMillesimeLabel(templateKey.month, templateKey.year);
      const newMillesime = formatMillesimeLabel(_month, _year);
      if (next.includes(oldMillesime)) {
        return next.replace(oldMillesime, newMillesime);
      }
      if (templateKey.gamme && next.includes(templateKey.gamme)) {
        return next.replace(templateKey.gamme, gamme);
      }
    }
  }

  const newMillesime = formatMillesimeLabel(_month, _year);
  for (let month = 1; month <= 12; month++) {
    for (const year of [_year - 1, _year, _year + 1]) {
      const candidate = formatMillesimeLabel(month, year);
      if (candidate !== newMillesime && next.includes(candidate)) {
        next = next.replace(candidate, newMillesime);
        return next;
      }
    }
  }

  return `${trimmed.replace(/\s*$/u, "")} ${newMillesime}`.trim();
}

/** Catalogue passé ou rechargé si absent / vide (évite les doublons). */
async function resolveExceltisCatalogue(etiquettes?: Etiquette[]): Promise<Etiquette[]> {
  if (etiquettes != null && etiquettes.length > 0) {
    return etiquettes;
  }
  return getAllEtiquettes();
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
  const list = await resolveExceltisCatalogue(etiquettes);
  const existing = findExceltisEtiquetteInList(gamme, month, year, list);
  if (existing) {
    return { nom: existing.nom, etiquette: existing, created: false };
  }

  const template = findLatestExceltisEtiquetteForClone(list, gamme);
  const templates = await getAllTemplatesEmail();
  const emailTemplate = templates.find((t) => t.nom === EXCELITIS_EMAIL_TEMPLATE_NOM);
  const payload = buildNewExceltisEtiquettePayload(
    nom,
    template,
    emailTemplate?.id ?? null,
    rendementCible
  );
  const etiquette = await createEtiquette(payload);

  if (template) {
    await cloneExceltisEtiquetteSidecar(
      template,
      etiquette.id,
      nom,
      gamme,
      month,
      year
    );
  }

  return {
    nom,
    etiquette,
    created: true,
    clonedFrom: template?.nom,
  };
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
