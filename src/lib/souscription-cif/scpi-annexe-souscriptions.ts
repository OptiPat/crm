import { formatEuroAmountCif, parseEuroInput } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import {
  getScpiAnnexeDefaultPartPriceEurString,
  getScpiAnnexeCatalogPartPriceEur,
  SCPI_ANNEXE_PRODUCT_FICHES,
} from "@/lib/souscription-cif/scpi-annexe-catalog";

export type ScpiVpFrequence = "mois" | "trimestre" | "semestre" | "an";

export const SCPI_VP_FREQUENCE_OPTIONS: ReadonlyArray<{
  value: ScpiVpFrequence;
  label: string;
  /** Suffixe dans le texte « Mes préconisations » (ex. « 50 €/mois »). */
  textSuffix: string;
}> = [
  { value: "mois", label: "€/mois", textSuffix: "/mois" },
  { value: "trimestre", label: "€/trim.", textSuffix: "/trimestre" },
  { value: "semestre", label: "€/sem.", textSuffix: "/semestre" },
  { value: "an", label: "€/an", textSuffix: "/an" },
];

export type ScpiAnnexeSouscription = {
  productKey: string;
  /** Montant souscrit en euros (saisie libre, ex. « 30000 » ou « 30 000 »). */
  montantSouscritEur: string;
  /** Prix d'une part (€) — surcharge du catalogue, modifiable par dossier. */
  partPriceEur: string;
  /** Réinvestissement des dividendes (0–100). Vide = pas de réinvestissement. */
  reinvestissementDividendesPct: string;
  /** Montant des versements programmés (€). Vide = pas de VP. */
  vpMontantEur: string;
  vpFrequence: ScpiVpFrequence;
};

export function normalizeScpiVpFrequence(raw: unknown): ScpiVpFrequence {
  if (raw === "trimestre" || raw === "semestre" || raw === "an") return raw;
  return "mois";
}

export function parsePercentInput(value: string): number | null {
  const trimmed = value.trim().replace(/%/g, "").replace(/,/g, ".");
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function formatPercentCif(percent: number): string {
  const rounded = Math.round(percent * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
  return `${text}%`;
}

export function getScpiAnnexeProductLabel(productKey: string): string | null {
  return SCPI_ANNEXE_PRODUCT_FICHES.find((p) => p.key === productKey)?.label ?? null;
}

export function resolveScpiPartPriceEur(row: ScpiAnnexeSouscription): number | null {
  const fromRow = parseEuroInput(row.partPriceEur);
  if (fromRow != null && fromRow > 0) return fromRow;
  return getScpiAnnexeCatalogPartPriceEur(row.productKey);
}

export function getScpiAnnexeProductKeysFromSouscriptions(
  souscriptions: readonly ScpiAnnexeSouscription[]
): string[] {
  return souscriptions.map((s) => s.productKey);
}

export function sumMontantSouscritFromSouscriptions(
  souscriptions: readonly ScpiAnnexeSouscription[]
): number | null {
  let total = 0;
  let hasAny = false;
  for (const row of souscriptions) {
    const montant = parseEuroInput(row.montantSouscritEur);
    if (montant == null) continue;
    total += montant;
    hasAny = true;
  }
  return hasAny ? total : null;
}

function vpTextSuffix(freq: ScpiVpFrequence): string {
  return SCPI_VP_FREQUENCE_OPTIONS.find((o) => o.value === freq)?.textSuffix ?? "/mois";
}

function formatVpMontantText(montant: number, freq: ScpiVpFrequence): string {
  const amount = formatEuroAmountCif(montant).replace(/\s*€$/, "");
  return `${amount} €${vpTextSuffix(freq)}`;
}

/** Fragment réinvestissement + VP pour une ligne SCPI. */
export function buildScpiSouscriptionOptionsFragment(
  row: ScpiAnnexeSouscription,
  productLabel: string | null,
  multiScpi: boolean
): string | null {
  const parts: string[] = [];
  const reinv = parsePercentInput(row.reinvestissementDividendesPct);
  if (reinv != null && reinv > 0) {
    parts.push(`réinvestissement automatique de ${formatPercentCif(reinv)} des dividendes`);
  }
  const vp = parseEuroInput(row.vpMontantEur);
  if (vp != null && vp > 0) {
    parts.push(
      `${formatVpMontantText(vp, row.vpFrequence)} de versements programmés`
    );
  }
  if (parts.length === 0) return null;

  let text = parts.join(" + ");
  if (multiScpi && productLabel) {
    text = `${productLabel} : ${text}`;
  }
  return text;
}

/** Complément « Avec … » construit depuis les options de chaque souscription. */
export function buildOptionsComplementFromSouscriptions(
  souscriptions: readonly ScpiAnnexeSouscription[]
): string {
  const rowsWithMontant = souscriptions.filter(
    (row) => parseEuroInput(row.montantSouscritEur) != null
  );
  if (rowsWithMontant.length === 0) return "";

  const multi = rowsWithMontant.length > 1;
  const fragments = rowsWithMontant
    .map((row) =>
      buildScpiSouscriptionOptionsFragment(
        row,
        getScpiAnnexeProductLabel(row.productKey),
        multi
      )
    )
    .filter((f): f is string => f != null);

  if (fragments.length === 0) return "";
  if (!multi && fragments.length === 1) {
    return `Avec ${fragments[0]}.`;
  }
  return fragments.map((f) => (f.endsWith(".") ? f : `${f}.`)).join(" ; ");
}

function buildScpiSouscriptionLine(
  label: string,
  montant: number,
  partPriceEur: number | null
): string {
  const montantFmt = formatEuroAmountCif(montant);
  let line = `La souscription de parts de SCPI de rendement ${label} en pleine propriété au comptant pour un montant de ${montantFmt}`;
  if (partPriceEur != null) {
    const nbParts = Math.round(montant / partPriceEur);
    if (nbParts > 0) {
      line += `, soit ${formatEuroAmountCif(partPriceEur)} la part x ${nbParts} parts = montant total souscrit de ${montantFmt}`;
    }
  }
  return line;
}

/** True si le texte peut être regénéré sans écraser une retouche manuelle. */
export function shouldAutoSyncMesPreconisationsText(
  currentMesPreconisations: string,
  lastAutoMesPreconisations: string
): boolean {
  const trimmed = currentMesPreconisations.trim();
  return !trimmed || currentMesPreconisations === lastAutoMesPreconisations;
}

/** Format type CIF : intro + paragraphe unique (lignes SCPI séparées par « ; », options en fin). */
export function buildMesPreconisationsFromSouscriptions(
  souscriptions: readonly ScpiAnnexeSouscription[]
): string {
  const detailLines: string[] = [];
  for (const row of souscriptions) {
    const label = getScpiAnnexeProductLabel(row.productKey);
    const montant = parseEuroInput(row.montantSouscritEur);
    if (!label || montant == null) continue;
    detailLines.push(
      buildScpiSouscriptionLine(label, montant, resolveScpiPartPriceEur(row))
    );
  }

  const optionsComplement = buildOptionsComplementFromSouscriptions(souscriptions);

  if (detailLines.length === 0) {
    return optionsComplement;
  }

  const total = sumMontantSouscritFromSouscriptions(souscriptions);
  const intro =
    total != null
      ? `Mes préconisations portent sur un investissement global de ${formatEuroAmountCif(total)}, répartis ainsi :`
      : "Mes préconisations portent sur un investissement global, répartis ainsi :";

  let body = detailLines.join(" ; ");
  if (optionsComplement) {
    body += ` ; ${optionsComplement}`;
  }
  return `${intro}\n\n${body}`;
}

export const DEFAULT_SCPI_REINVESTISSEMENT_PCT = "100";
export const DEFAULT_SCPI_VP_MONTANT_EUR = "50";

function newScpiAnnexeSouscription(
  productKey: string,
  montantSouscritEur = "",
  withDefaultOptions = false
): ScpiAnnexeSouscription {
  return {
    productKey,
    montantSouscritEur,
    partPriceEur: getScpiAnnexeDefaultPartPriceEurString(productKey),
    reinvestissementDividendesPct: withDefaultOptions ? DEFAULT_SCPI_REINVESTISSEMENT_PCT : "",
    vpMontantEur: withDefaultOptions ? DEFAULT_SCPI_VP_MONTANT_EUR : "",
    vpFrequence: "mois",
  };
}

/** Souscription type par défaut — Comète 30 000 €, réinvest. 100 %, VP 50 €/mois. */
export function defaultScpiAnnexeSouscriptions(): ScpiAnnexeSouscription[] {
  return [newScpiAnnexeSouscription("comete", "30000", true)];
}

function normalizeScpiAnnexeSouscriptionRow(
  o: Partial<ScpiAnnexeSouscription>
): ScpiAnnexeSouscription | null {
  if (typeof o.productKey !== "string" || !o.productKey.trim()) return null;
  const productKey = o.productKey.trim();
  const partPriceEur =
    typeof o.partPriceEur === "string" && o.partPriceEur.trim()
      ? o.partPriceEur
      : getScpiAnnexeDefaultPartPriceEurString(productKey);
  return {
    productKey,
    montantSouscritEur: typeof o.montantSouscritEur === "string" ? o.montantSouscritEur : "",
    partPriceEur,
    reinvestissementDividendesPct:
      typeof o.reinvestissementDividendesPct === "string"
        ? o.reinvestissementDividendesPct
        : "",
    vpMontantEur: typeof o.vpMontantEur === "string" ? o.vpMontantEur : "",
    vpFrequence: normalizeScpiVpFrequence(o.vpFrequence),
  };
}

function parseMontantFromLegacyMesPreconisations(text: string): number | null {
  const patterns = [
    /investissement global de\s+([\d\s\u00a0\u202f]+)(?:[,.]\d+)?\s*€/i,
    /montant total souscrit de\s+([\d\s\u00a0\u202f]+)(?:[,.]\d+)?\s*€/i,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match) {
      const parsed = parseEuroInput(match[1]);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

/** Reprend le montant global depuis l’ancien paragraphe « Mes préconisations » si les lignes sont vides. */
function enrichMontantsFromLegacyText(
  rows: ScpiAnnexeSouscription[],
  legacyMesPreconisations?: unknown
): ScpiAnnexeSouscription[] {
  if (rows.length === 0) return rows;
  if (typeof legacyMesPreconisations !== "string" || !legacyMesPreconisations.trim()) {
    return rows;
  }
  const fromText = parseMontantFromLegacyMesPreconisations(legacyMesPreconisations);
  if (fromText == null) return rows;

  const allEmpty = rows.every((r) => parseEuroInput(r.montantSouscritEur) == null);
  if (!allEmpty) return rows;

  const montantStr = String(fromText);
  if (rows.length === 1) {
    return [{ ...rows[0], montantSouscritEur: montantStr }];
  }

  const cometeIdx = rows.findIndex((r) => r.productKey === "comete");
  const targetIdx = cometeIdx >= 0 ? cometeIdx : 0;
  return rows.map((r, i) =>
    i === targetIdx ? { ...r, montantSouscritEur: montantStr } : r
  );
}

export function normalizeScpiAnnexeSouscriptions(
  raw: unknown,
  legacyProductKeys?: unknown,
  legacyMesPreconisations?: unknown
): ScpiAnnexeSouscription[] {
  let result: ScpiAnnexeSouscription[] = [];

  if (Array.isArray(raw)) {
    const parsed = raw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        return normalizeScpiAnnexeSouscriptionRow(item as Partial<ScpiAnnexeSouscription>);
      })
      .filter((s): s is ScpiAnnexeSouscription => s != null);
    if (parsed.length > 0) result = parsed;
  }

  if (result.length === 0 && Array.isArray(legacyProductKeys)) {
    const keys = legacyProductKeys.filter((k): k is string => typeof k === "string");
    if (keys.length > 0) {
      result = keys.map((productKey) => newScpiAnnexeSouscription(productKey));
    }
  }

  if (result.length === 0) {
    if (typeof legacyMesPreconisations === "string" && legacyMesPreconisations.trim()) {
      const fromText = parseMontantFromLegacyMesPreconisations(legacyMesPreconisations);
      if (fromText != null) {
        result = [newScpiAnnexeSouscription("comete", String(fromText), true)];
      }
    }
  }

  return enrichMontantsFromLegacyText(result, legacyMesPreconisations);
}

export function upsertScpiAnnexeSouscription(
  souscriptions: readonly ScpiAnnexeSouscription[],
  productKey: string,
  checked: boolean
): ScpiAnnexeSouscription[] {
  if (!checked) {
    return souscriptions.filter((s) => s.productKey !== productKey);
  }
  if (souscriptions.some((s) => s.productKey === productKey)) {
    return [...souscriptions];
  }
  return [...souscriptions, newScpiAnnexeSouscription(productKey)];
}

export function patchScpiAnnexeSouscription<K extends keyof ScpiAnnexeSouscription>(
  souscriptions: readonly ScpiAnnexeSouscription[],
  productKey: string,
  field: K,
  value: ScpiAnnexeSouscription[K]
): ScpiAnnexeSouscription[] {
  return souscriptions.map((s) =>
    s.productKey === productKey ? { ...s, [field]: value } : s
  );
}
