/**
 * Export « Supports » Cristalliance : une ligne par support détenu, par contrat.
 *
 * Le rattachement au CRM se fait sur le numéro de contrat, déjà porté par les investissements :
 * les colonnes d'identité du fichier (civilité, nom, prénom, email) sont volontairement ignorées,
 * il n'y a rien à dupliquer en base.
 *
 * Tous les supports sont conservés, y compris fonds euros, FCPR et produits structurés dont le
 * code n'est pas un ISIN normé : la photo du contrat doit être complète même si la veille fonds
 * ne sait analyser qu'une partie des lignes.
 */

export interface ContratSupportImportRow {
  numero_contrat: string;
  isin: string;
  libelle: string;
  societe_gestion: string | null;
  type_support: string | null;
  sri: number | null;
  nb_parts: number | null;
  valeur_unitaire: number | null;
  encours: number | null;
  plus_moins_value_pct: number | null;
  date_valeur: number | null;
}

interface ColumnLayout {
  numeroContrat: number;
  isin: number;
  support: number;
  societeGestion: number;
  type: number;
  sri: number;
  nbParts: number;
  valeurUnitaire: number;
  encours: number;
  plusMoinsValue: number;
  dateValeur: number;
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findColumn(headers: string[], matches: (header: string) => boolean): number {
  return headers.findIndex((header) => matches(header));
}

function detectLayout(headerLine: string): ColumnLayout | null {
  const headers = headerLine.split(";").map(normalizeHeader);
  const layout: ColumnLayout = {
    numeroContrat: findColumn(headers, (h) => h.includes("numero contrat")),
    isin: findColumn(headers, (h) => h.includes("isin")),
    support: findColumn(headers, (h) => h === "support"),
    societeGestion: findColumn(headers, (h) => h.includes("societe de gestion")),
    type: findColumn(headers, (h) => h === "type"),
    sri: findColumn(headers, (h) => h === "sri"),
    nbParts: findColumn(headers, (h) => h.includes("nombre de parts")),
    valeurUnitaire: findColumn(headers, (h) => h.includes("valeur unitaire")),
    encours: findColumn(headers, (h) => h.includes("encours")),
    // L'export livre deux colonnes « +/- value » : celle en euros, souvent « Non disponible »,
    // précède celle en pourcentage. Cibler le pourcentage explicitement, sinon la première
    // correspondance emporte la colonne euros et la plus/moins-value reste vide.
    plusMoinsValue: findColumn(headers, (h) => h.includes("value") && h.includes("%")),
    dateValeur: findColumn(headers, (h) => h.includes("date valeur")),
  };
  if (layout.numeroContrat < 0 || layout.isin < 0 || layout.support < 0) return null;
  return layout;
}

function cell(fields: string[], index: number): string {
  if (index < 0) return "";
  return (fields[index] ?? "").trim();
}

function optionalString(value: string): string | null {
  return value ? value : null;
}

/** Nombres français de l'export : « 1 234,56 », « -3,5 », séparateurs insécables possibles. */
export function parseContratSupportNumber(value: string): number | null {
  const cleaned = value
    .replace(/\u00a0|\u202f|\s/g, "")
    .replace(/\u2212/g, "-")
    .replace(",", ".");
  if (!cleaned || !/^[+-]?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function optionalInt(value: string): number | null {
  const n = parseContratSupportNumber(value);
  if (n == null) return null;
  return Math.round(n);
}

/** « 04/08/2026 » → timestamp Unix (secondes, minuit UTC). */
export function parseContratSupportDate(value: string): number | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * L'export sort en UTF-8 avec BOM, mais certaines versions de la plateforme livrent du
 * Windows-1252 : on retente le décodage si des caractères de remplacement apparaissent.
 */
export function decodeContratSupportsCsv(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("\ufffd")) return utf8;
  return new TextDecoder("windows-1252").decode(buffer);
}

export function parseContratSupportsCsv(text: string): ContratSupportImportRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headerLine = lines[0];
  if (!headerLine) return [];
  const layout = detectLayout(headerLine);
  if (!layout) return [];

  const out: ContratSupportImportRow[] = [];
  for (const line of lines.slice(1)) {
    const fields = line.split(";");
    const numero_contrat = cell(fields, layout.numeroContrat);
    const isin = cell(fields, layout.isin).toUpperCase();
    const libelle = cell(fields, layout.support);
    if (!numero_contrat || !isin || !libelle) continue;

    out.push({
      numero_contrat,
      isin,
      libelle,
      societe_gestion: optionalString(cell(fields, layout.societeGestion)),
      type_support: optionalString(cell(fields, layout.type)),
      sri: optionalInt(cell(fields, layout.sri)),
      nb_parts: parseContratSupportNumber(cell(fields, layout.nbParts)),
      valeur_unitaire: parseContratSupportNumber(cell(fields, layout.valeurUnitaire)),
      encours: parseContratSupportNumber(cell(fields, layout.encours)),
      plus_moins_value_pct: parseContratSupportNumber(cell(fields, layout.plusMoinsValue)),
      date_valeur: parseContratSupportDate(cell(fields, layout.dateValeur)),
    });
  }
  return out;
}

export interface ContratSupportsImportSummary {
  lignes: number;
  contrats: number;
  supports: number;
  encoursTotal: number;
  dateValeur: number | null;
}

export function summarizeContratSupportsImport(
  rows: ContratSupportImportRow[]
): ContratSupportsImportSummary {
  const contrats = new Set<string>();
  const supports = new Set<string>();
  let encoursTotal = 0;
  let dateValeur: number | null = null;

  for (const row of rows) {
    contrats.add(row.numero_contrat);
    supports.add(row.isin);
    encoursTotal += row.encours ?? 0;
    if (row.date_valeur != null && (dateValeur == null || row.date_valeur > dateValeur)) {
      dateValeur = row.date_valeur;
    }
  }

  return {
    lignes: rows.length,
    contrats: contrats.size,
    supports: supports.size,
    encoursTotal,
    dateValeur,
  };
}
