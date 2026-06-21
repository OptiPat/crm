import type {
  Investissement,
  InvestissementWithDetails,
} from "@/lib/api/tauri-investissements";
import { getInvestissementById } from "@/lib/api/tauri-investissements";
import { createInvestissementValorisation } from "@/lib/api/tauri-investissement-valorisations";
import { parseImportDate } from "@/lib/contacts/parse-import-date";
import {
  normalizeNumeroContrat,
  numeroContratMatchKey,
} from "@/lib/investissements/investissement-display";
import { parseEuroInput } from "@/lib/souscription-cif/build-annexes-scpi-costs";

export type StelliumContratCsvRow = {
  rowIndex: number;
  numeroContrat: string;
  titulaire: string;
  enveloppe: string;
  contratLibelle: string;
  partenaire: string;
  valorisationCentimes: number;
  versementsNetsCentimes: number | null;
  rachatsCentimes: number | null;
  perfEuroCentimes: number | null;
  perfPctCalc: number | null;
  dateValorisationIso?: string;
};

export type StelliumImportLineStatus =
  | "ready"
  | "unchanged"
  | "not_found"
  | "duplicate_crm"
  | "duplicate_csv"
  | "invalid";

export type StelliumImportPreviewLine = StelliumContratCsvRow & {
  lineKey: string;
  status: StelliumImportLineStatus;
  statusMessage: string;
  investissementId?: number;
  crmContactLabel?: string;
  crmContactNom?: string;
  crmContactPrenom?: string;
  crmFoyerNom?: string;
  crmNomProduit?: string;
  crmEncoursCentimes?: number;
  crmEncoursDate?: number;
};

export type StelliumImportPreviewSummary = {
  total: number;
  ready: number;
  unchanged: number;
  notFound: number;
  duplicateCrm: number;
  duplicateCsv: number;
  invalid: number;
};

const COLUMN_ALIASES = {
  numeroContrat: ["n° de contrat", "n de contrat", "numero de contrat", "numéro de contrat"],
  titulaire: ["titulaire"],
  enveloppe: ["enveloppe"],
  contrat: ["^contrat$"],
  partenaire: ["partenaire"],
  valorisation: ["valorisation"],
  versementsNets: ["montant total des versements nets", "versements nets"],
  rachats: ["montant total des rachats bruts", "rachats bruts"],
  perfEuro: ["performance financière en euros", "perf du contrat)"],
  dateValorisation: ["date de valorisation"],
} as const;

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function findColumnKey(
  sampleRow: Record<string, unknown>,
  aliases: readonly string[]
): string | undefined {
  for (const key of Object.keys(sampleRow)) {
    const normalized = normalizeHeader(key);
    if (aliases.some((alias) => {
      if (alias.startsWith("^") && alias.endsWith("$")) {
        return normalized === alias.slice(1, -1);
      }
      return normalized === alias || normalized.includes(alias);
    })) {
      return key;
    }
  }
  return undefined;
}

function isNonDisponible(value: unknown): boolean {
  return String(value ?? "")
    .trim()
    .toLowerCase() === "non disponible";
}

/** Montant Stellium (€ avec virgule) → centimes entiers. */
export function parseStelliumEuroToCentimes(value: unknown): number | null {
  if (isNonDisponible(value)) return null;
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return null;
  const euros = parseEuroInput(raw);
  if (euros == null) return null;
  return Math.round(euros * 100);
}

/** Perf % = (valorisation − versements nets + rachats) / versements nets × 100 */
export function computeStelliumPerfPct(
  valorisationCentimes: number,
  versementsNetsCentimes: number | null,
  rachatsCentimes: number | null
): number | null {
  if (versementsNetsCentimes == null || versementsNetsCentimes <= 0) return null;
  const rachats = rachatsCentimes ?? 0;
  const gain = valorisationCentimes - versementsNetsCentimes + rachats;
  return (gain / versementsNetsCentimes) * 100;
}

function sameCalendarDayUnix(unixSeconds?: number, iso?: string): boolean {
  if (unixSeconds == null || !iso) return false;
  const d1 = new Date(unixSeconds * 1000);
  const d2 = new Date(iso);
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  );
}

function resolveColumnKeys(
  sampleRow: Record<string, unknown>
): Record<keyof typeof COLUMN_ALIASES, string | undefined> {
  return {
    numeroContrat: findColumnKey(sampleRow, COLUMN_ALIASES.numeroContrat),
    titulaire: findColumnKey(sampleRow, COLUMN_ALIASES.titulaire),
    enveloppe: findColumnKey(sampleRow, COLUMN_ALIASES.enveloppe),
    contrat: findColumnKey(sampleRow, COLUMN_ALIASES.contrat),
    partenaire: findColumnKey(sampleRow, COLUMN_ALIASES.partenaire),
    valorisation: findColumnKey(sampleRow, COLUMN_ALIASES.valorisation),
    versementsNets: findColumnKey(sampleRow, COLUMN_ALIASES.versementsNets),
    rachats: findColumnKey(sampleRow, COLUMN_ALIASES.rachats),
    perfEuro: findColumnKey(sampleRow, COLUMN_ALIASES.perfEuro),
    dateValorisation: findColumnKey(sampleRow, COLUMN_ALIASES.dateValorisation),
  };
}

export function parseStelliumContratsCsvRows(
  rawRows: Record<string, unknown>[]
): StelliumContratCsvRow[] {
  if (rawRows.length === 0) return [];
  const keys = resolveColumnKeys(rawRows[0]!);
  const rows: StelliumContratCsvRow[] = [];

  rawRows.forEach((raw, index) => {
    const numeroContrat =
      normalizeNumeroContrat(
        keys.numeroContrat ? String(raw[keys.numeroContrat] ?? "") : undefined
      ) ?? "";
    const valorisationCentimes = keys.valorisation
      ? parseStelliumEuroToCentimes(raw[keys.valorisation])
      : null;
    if (!numeroContrat || valorisationCentimes == null) return;

    const versementsNetsCentimes = keys.versementsNets
      ? parseStelliumEuroToCentimes(raw[keys.versementsNets])
      : null;
    const rachatsCentimes = keys.rachats
      ? parseStelliumEuroToCentimes(raw[keys.rachats])
      : null;
    const perfEuroCentimes = keys.perfEuro
      ? parseStelliumEuroToCentimes(raw[keys.perfEuro])
      : null;

    rows.push({
      rowIndex: index + 1,
      numeroContrat,
      titulaire: keys.titulaire ? String(raw[keys.titulaire] ?? "").trim() : "",
      enveloppe: keys.enveloppe ? String(raw[keys.enveloppe] ?? "").trim() : "",
      contratLibelle: keys.contrat ? String(raw[keys.contrat] ?? "").trim() : "",
      partenaire: keys.partenaire ? String(raw[keys.partenaire] ?? "").trim() : "",
      valorisationCentimes,
      versementsNetsCentimes,
      rachatsCentimes,
      perfEuroCentimes,
      perfPctCalc: computeStelliumPerfPct(
        valorisationCentimes,
        versementsNetsCentimes,
        rachatsCentimes
      ),
      dateValorisationIso: keys.dateValorisation
        ? parseImportDate(raw[keys.dateValorisation])
        : undefined,
    });
  });

  return rows;
}

export type StelliumImportInvestissementRef = Pick<
  Investissement,
  "id" | "numero_contrat" | "encours_actuel" | "encours_date" | "nom_produit"
> & {
  contactLabel?: string;
  contactNom?: string;
  contactPrenom?: string;
  foyerNom?: string;
};

export function mapDetailsToStelliumImportRef(
  inv: InvestissementWithDetails
): StelliumImportInvestissementRef {
  return {
    id: inv.id,
    numero_contrat: inv.numero_contrat,
    encours_actuel: inv.encours_actuel,
    encours_date: inv.encours_date,
    nom_produit: inv.nom_produit,
    contactNom: inv.contact_nom?.trim() || undefined,
    contactPrenom: inv.contact_prenom?.trim() || undefined,
    foyerNom: inv.foyer_nom?.trim() || undefined,
    contactLabel:
      [inv.contact_prenom, inv.contact_nom].filter(Boolean).join(" ").trim() ||
      inv.foyer_nom ||
      undefined,
  };
}

function buildInvestissementsByNumero(
  investissements: StelliumImportInvestissementRef[]
): Map<string, StelliumImportInvestissementRef[]> {
  const map = new Map<string, StelliumImportInvestissementRef[]>();
  for (const inv of investissements) {
    const key = numeroContratMatchKey(inv.numero_contrat);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(inv);
    map.set(key, list);
  }
  return map;
}

/** Nom de famille pour tri — titulaire Stellium type « DUPONT Jean ». */
export function famillesNomFromTitulaire(titulaire: string): string {
  const trimmed = titulaire.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!;
  if (/^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'\-]*$/.test(parts[0]!)) return parts[0]!;
  return parts[parts.length - 1]!;
}

export function famillesNomForStelliumImportLine(
  line: Pick<
    StelliumImportPreviewLine,
    "crmContactNom" | "crmFoyerNom" | "titulaire"
  >
): string {
  if (line.crmContactNom?.trim()) return line.crmContactNom.trim();
  if (line.crmFoyerNom?.trim()) return line.crmFoyerNom.trim();
  return famillesNomFromTitulaire(line.titulaire);
}

export function sortStelliumImportPreviewLines(
  lines: StelliumImportPreviewLine[]
): StelliumImportPreviewLine[] {
  return [...lines].sort((a, b) => {
    const byNom = famillesNomForStelliumImportLine(a).localeCompare(
      famillesNomForStelliumImportLine(b),
      "fr",
      { sensitivity: "base" }
    );
    if (byNom !== 0) return byNom;
    const byPrenom = (a.crmContactPrenom ?? "").localeCompare(
      b.crmContactPrenom ?? "",
      "fr",
      { sensitivity: "base" }
    );
    if (byPrenom !== 0) return byPrenom;
    return a.numeroContrat.localeCompare(b.numeroContrat, "fr", { numeric: true });
  });
}

function enrichMatchedLine(
  base: StelliumContratCsvRow & { lineKey: string },
  inv: StelliumImportInvestissementRef,
  status: StelliumImportLineStatus,
  statusMessage: string
): StelliumImportPreviewLine {
  return {
    ...base,
    status,
    statusMessage,
    investissementId: inv.id,
    crmContactLabel: inv.contactLabel,
    crmContactNom: inv.contactNom,
    crmContactPrenom: inv.contactPrenom,
    crmFoyerNom: inv.foyerNom,
    crmNomProduit: inv.nom_produit,
    crmEncoursCentimes: inv.encours_actuel,
    crmEncoursDate: inv.encours_date,
  };
}

export function summarizeStelliumImportPreview(
  lines: StelliumImportPreviewLine[]
): StelliumImportPreviewSummary {
  const summary: StelliumImportPreviewSummary = {
    total: lines.length,
    ready: 0,
    unchanged: 0,
    notFound: 0,
    duplicateCrm: 0,
    duplicateCsv: 0,
    invalid: 0,
  };
  for (const line of lines) {
    switch (line.status) {
      case "ready":
        summary.ready += 1;
        break;
      case "unchanged":
        summary.unchanged += 1;
        break;
      case "not_found":
        summary.notFound += 1;
        break;
      case "duplicate_crm":
        summary.duplicateCrm += 1;
        break;
      case "duplicate_csv":
        summary.duplicateCsv += 1;
        break;
      case "invalid":
        summary.invalid += 1;
        break;
    }
  }
  return summary;
}

export function buildStelliumContratsImportPreview(
  csvRows: StelliumContratCsvRow[],
  investissements: StelliumImportInvestissementRef[]
): StelliumImportPreviewLine[] {
  const byNumero = buildInvestissementsByNumero(investissements);
  const seenNumero = new Set<string>();
  const lines: StelliumImportPreviewLine[] = [];

  for (const row of csvRows) {
    const lineKey = `${row.numeroContrat}-${row.rowIndex}`;
    const base = { ...row, lineKey };

    if (!row.dateValorisationIso) {
      lines.push({
        ...base,
        status: "invalid",
        statusMessage: "Date de valorisation manquante ou illisible",
      });
      continue;
    }

    const matchKey = numeroContratMatchKey(row.numeroContrat);
    if (!matchKey) {
      lines.push({
        ...base,
        status: "invalid",
        statusMessage: "N° de contrat manquant ou illisible",
      });
      continue;
    }

    if (seenNumero.has(matchKey)) {
      lines.push({
        ...base,
        status: "duplicate_csv",
        statusMessage: "N° de contrat déjà présent plus haut dans le fichier",
      });
      continue;
    }
    seenNumero.add(matchKey);

    const matches = byNumero.get(matchKey) ?? [];
    if (matches.length === 0) {
      lines.push({
        ...base,
        status: "not_found",
        statusMessage: "Aucun investissement CRM avec ce n° de contrat",
      });
      continue;
    }
    if (matches.length > 1) {
      lines.push({
        ...base,
        status: "duplicate_crm",
        statusMessage: `${matches.length} investissements CRM partagent ce n°`,
      });
      continue;
    }

    const inv = matches[0]!;
    const unchanged =
      inv.encours_actuel === row.valorisationCentimes &&
      sameCalendarDayUnix(inv.encours_date, row.dateValorisationIso);

    if (unchanged) {
      lines.push(
        enrichMatchedLine(
          base,
          inv,
          "unchanged",
          "Encours déjà à jour (montant et date identiques)"
        )
      );
      continue;
    }

    lines.push(
      enrichMatchedLine(base, inv, "ready", "Prêt — mise à jour encours")
    );
  }

  return sortStelliumImportPreviewLines(lines);
}

/** Après import réussi : passe la ligne en « déjà à jour ». */
export function markStelliumLineImported(
  line: StelliumImportPreviewLine
): StelliumImportPreviewLine {
  const encoursDate = line.dateValorisationIso
    ? Math.floor(new Date(line.dateValorisationIso).getTime() / 1000)
    : line.crmEncoursDate;
  return {
    ...line,
    status: "unchanged",
    statusMessage: "Encours importé",
    crmEncoursCentimes: line.valorisationCentimes,
    crmEncoursDate: encoursDate,
  };
}

export type ApplyStelliumImportResult =
  | { ok: true; line: StelliumImportPreviewLine }
  | { ok: false; reason: "invalid" | "stale" | "error" };

function isStelliumLineStillReady(
  line: StelliumImportPreviewLine,
  inv: Pick<Investissement, "numero_contrat" | "encours_actuel" | "encours_date">
): boolean {
  if (numeroContratMatchKey(inv.numero_contrat) !== numeroContratMatchKey(line.numeroContrat)) {
    return false;
  }
  return !(
    inv.encours_actuel === line.valorisationCentimes &&
    sameCalendarDayUnix(inv.encours_date, line.dateValorisationIso)
  );
}

export async function applyStelliumImportLine(
  line: StelliumImportPreviewLine
): Promise<ApplyStelliumImportResult> {
  if (line.status !== "ready" || line.investissementId == null || !line.dateValorisationIso) {
    return { ok: false, reason: "invalid" };
  }
  try {
    const fresh = await getInvestissementById(line.investissementId);
    if (!isStelliumLineStillReady(line, fresh)) {
      return { ok: false, reason: "stale" };
    }
    await createInvestissementValorisation({
      investissement_id: line.investissementId,
      montant: line.valorisationCentimes,
      date_valorisation: line.dateValorisationIso,
      notes: "Import Stellium contrats",
    });
    return { ok: true, line: markStelliumLineImported(line) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function applyStelliumContratsImport(
  lines: StelliumImportPreviewLine[],
  selectedLineKeys: ReadonlySet<string>
): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;

  for (const line of lines) {
    if (line.status !== "ready" || !selectedLineKeys.has(line.lineKey)) continue;
    const result = await applyStelliumImportLine(line);
    if (result.ok) {
      applied += 1;
    } else {
      failed += 1;
    }
  }

  return { applied, failed };
}
