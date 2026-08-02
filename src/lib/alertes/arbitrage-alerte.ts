/** Alerte patrimoine : suivi arbitrage AV/PER « avec moi ». */

import { dateInputToUnix, unixToDateInput } from "@/lib/dates/calendar-date";
import { dateInputToday, startOfTodayUnix } from "@/lib/taches/tache-date-shortcuts";

export const ALERTE_TYPE_ARBITRAGE_AV_PER = "ARBITRAGE_AV_PER";

export function isAlerteArbitrageAvPer(typeAlerte: string): boolean {
  return typeAlerte === ALERTE_TYPE_ARBITRAGE_AV_PER;
}

export function isArbitrageSuiviEligible(
  typeProduit: string,
  origine: string,
  statut?: string
): boolean {
  return (
    (statut ?? "ACTIF") === "ACTIF" &&
    origine === "MON_CONSEIL" &&
    (typeProduit === "ASSURANCE_VIE" || typeProduit === "PER")
  );
}

/** Tâche auto créée par le moteur arbitrage (titre normalisé côté Rust). */
export function isArbitrageAutoTask(tache: { titre: string }): boolean {
  return (
    tache.titre.startsWith("Arbitrage assurance vie —") ||
    tache.titre.startsWith("Arbitrage PER —")
  );
}

/** Tâche arbitrage assurance vie uniquement. */
export function isArbitrageAvAutoTask(tache: { titre: string }): boolean {
  return tache.titre.startsWith("Arbitrage assurance vie —");
}

/** Tâche arbitrage PER uniquement. */
export function isArbitragePerAutoTask(tache: { titre: string }): boolean {
  return tache.titre.startsWith("Arbitrage PER —");
}

export type ArbitrageFicheProductKind = "AV" | "PER";

/** Déduit AV ou PER depuis le titre de la tâche arbitrage auto. */
export function resolveArbitrageFicheProductKind(tache: {
  titre: string;
}): ArbitrageFicheProductKind | null {
  if (isArbitrageAvAutoTask(tache)) return "AV";
  if (isArbitragePerAutoTask(tache)) return "PER";
  return null;
}

export function parseArbitrageInvestissementId(
  description?: string | null
): number | null {
  if (!description) return null;
  const match = description.match(/crm:investissement_id:(\d+)/);
  if (!match) return null;
  const id = Number.parseInt(match[1], 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export const FICHE_CONSEIL_EXCELITIS_MARKER = "crm:fiche_conseil_exceltis";

/** Tâche créée par une étiquette Exceltis (fiche conseil possible). */
export function isExceltisFicheConseilTask(tache: { description?: string | null }): boolean {
  return tache.description?.includes(FICHE_CONSEIL_EXCELITIS_MARKER) ?? false;
}

/** Tâche éligible au bouton Fiche Conseil (arbitrage auto ou Exceltis). */
export function isFicheConseilTask(tache: {
  titre: string;
  description?: string | null;
}): boolean {
  return isArbitrageAutoTask(tache) || isExceltisFicheConseilTask(tache);
}

const TACHE_METADATA_LINE =
  /^(crm:fiche_conseil_exceltis|crm:investissement_id:\d+)$/;

/** Partie lisible de la description (sans métadonnées CRM internes). */
export function stripTacheDescriptionMetadata(description?: string | null): string {
  if (!description?.trim()) return "";
  return description
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !TACHE_METADATA_LINE.test(line))
    .join("\n")
    .trim();
}

function extractTacheDescriptionMetadataLines(description?: string | null): string[] {
  if (!description?.trim()) return [];
  return description
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => TACHE_METADATA_LINE.test(line));
}

/** Réinjecte les métadonnées CRM après édition utilisateur de la description. */
export function mergeTacheDescriptionWithMetadata(
  userDescription: string,
  existingDescription?: string | null
): string | null {
  const metadataLines = extractTacheDescriptionMetadataLines(existingDescription);
  const user = userDescription.trim();
  const parts = [...metadataLines];
  if (user) parts.push(user);
  return parts.length > 0 ? parts.join("\n") : null;
}

/** Description affichée dans l'UI (notes utilisateur uniquement). */
export function displayTacheDescription(description?: string | null): string {
  return stripTacheDescriptionMetadata(description);
}

/** Ajoute des mois calendaires UTC à une date input (ou à aujourd'hui si vide). */
export function dateInputAddMonthsUtc(
  fromInput: string | null | undefined,
  months: number,
  nowMs: number = Date.now()
): string {
  const base =
    fromInput && fromInput.trim()
      ? dateInputToUnix(fromInput)
      : startOfTodayUnix(nowMs);
  if (base == null) return dateInputToday(nowMs);
  const d = new Date(base * 1000);
  d.setUTCMonth(d.getUTCMonth() + months);
  return unixToDateInput(Math.floor(d.getTime() / 1000));
}

/** Prochain arbitrage par défaut : +6 mois UTC depuis une date (ou aujourd'hui). */
export function defaultProchainArbitrageDateInput(
  fromInput?: string | null,
  nowMs: number = Date.now()
): string {
  return dateInputAddMonthsUtc(fromInput ?? null, 6, nowMs);
}

export function arbitrageDatesToUnix(input: {
  dateDernier: string;
  dateProchain: string;
}): { dateDernier: number; dateProchain: number } | null {
  const dateDernier = dateInputToUnix(input.dateDernier);
  const dateProchain = dateInputToUnix(input.dateProchain);
  if (dateDernier == null || dateProchain == null) return null;
  if (dateProchain < dateDernier) return null;
  return { dateDernier, dateProchain };
}

export type ArbitrageCompleteDates = {
  dateDernier: string;
  dateProchain: string;
};

export type ArbitrageCompletePayload = ArbitrageCompleteDates & {
  note?: string;
};
