import type { Contact } from "@/lib/api/tauri-contacts";
import { unwrapImportCell } from "@/lib/contacts/import-row";
import { parseNomCompletInvestisseur } from "@/lib/contacts/investor-name-parse";
import { findContactByNameKeyWithSwap } from "@/lib/contacts/name-match";
import { stripMonOrganisationDisplayPrefix } from "@/lib/contacts/mon-organisation-import";
import { parseImportMontantEuros } from "@/lib/investissements/parse-import-montant-euros";

export const ORGANISATION_VOLUMES_PROPRE_SHEET_HINT = "Historique des VAVC Perso";
export const ORGANISATION_VOLUMES_BRANCHE_SHEET_HINT = "Historique des VAVC 4 niveaux";

/** @deprecated Utiliser ORGANISATION_VOLUMES_PROPRE_SHEET_HINT */
export const ORGANISATION_VOLUMES_HISTORY_SHEET_HINT = ORGANISATION_VOLUMES_PROPRE_SHEET_HINT;

export type OrganisationVolumeSheetKind = "propre" | "branche";

const CONSULTANT_NAME_ALIASES = [
  "nom prénom du consultant",
  "nom prenom du consultant",
  "consultant",
];

const EXERCICE_LABEL_RE = /(\d{4}-\d{4})/;

export type OrganisationVolumePropreColumnMap = Map<
  string,
  { combined?: string; va?: string; vaa?: string }
>;

export type OrganisationVolumeBrancheColumnMap = Map<string, string>;

/** @deprecated Utiliser OrganisationVolumePropreColumnMap */
export type OrganisationVolumeColumnMap = OrganisationVolumePropreColumnMap;

export type OrganisationVolumeImportCell = {
  exerciceLabel: string;
  volumePropre?: number;
  volumeBranche?: number;
};

export type OrganisationVolumeImportRow = {
  rowIndex: number;
  displayName: string;
  nom: string;
  prenom: string;
  cells: OrganisationVolumeImportCell[];
};

export type OrganisationVolumeImportLineStatus = "ready" | "invalid" | "unmatched";

export type OrganisationVolumeImportPreviewLine = OrganisationVolumeImportRow & {
  lineKey: string;
  status: OrganisationVolumeImportLineStatus;
  statusMessage: string;
  contactId?: number;
};

export type OrganisationVolumeImportSummary = {
  total: number;
  ready: number;
  invalid: number;
  unmatched: number;
  cellCount: number;
};

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cellStr(value: unknown): string {
  return String(unwrapImportCell(value) ?? "").trim();
}

function parseVolumeCell(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  const raw = cellStr(value);
  if (!raw || raw === "-" || raw.startsWith("#")) return null;
  return parseImportMontantEuros(raw);
}

function isVariationColumn(normalized: string): boolean {
  return normalized.includes(" vs ") || normalized.startsWith("dont ");
}

export function buildOrganisationVolumePropreColumnMap(
  headers: string[]
): OrganisationVolumePropreColumnMap {
  const map: OrganisationVolumePropreColumnMap = new Map();

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const match = EXERCICE_LABEL_RE.exec(header);
    if (!match) continue;
    const label = match[1]!;
    if (isVariationColumn(normalized)) continue;
    if (normalized.includes("4 niveaux") || normalized.includes("4niveaux")) continue;

    const bucket = map.get(label) ?? {};
    if (normalized.includes("va + vaa") || normalized.includes("vavc perso")) {
      bucket.combined = header;
    } else if (normalized.startsWith("vaa vc perso")) {
      bucket.vaa = header;
    } else if (normalized.startsWith("va vc perso")) {
      bucket.va = header;
    } else if (normalized.includes("vc perso")) {
      bucket.combined = header;
    }
    map.set(label, bucket);
  }

  return map;
}

/** @deprecated Utiliser buildOrganisationVolumePropreColumnMap */
export function buildOrganisationVolumeColumnMap(headers: string[]): OrganisationVolumeColumnMap {
  return buildOrganisationVolumePropreColumnMap(headers);
}

export function buildOrganisationVolumeBrancheColumnMap(
  headers: string[]
): OrganisationVolumeBrancheColumnMap {
  const map: OrganisationVolumeBrancheColumnMap = new Map();

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const match = EXERCICE_LABEL_RE.exec(header);
    if (!match) continue;
    const label = match[1]!;
    if (isVariationColumn(normalized)) continue;
    if (!normalized.includes("4 niveaux") && !normalized.includes("4niveaux")) continue;
    if (normalized.includes("vc perso")) continue;
    map.set(label, header);
  }

  return map;
}

export function detectOrganisationVolumeSheetKind(
  sheetName: string,
  headers: string[]
): OrganisationVolumeSheetKind | null {
  const normalizedName = normalizeHeader(sheetName);
  const propreMap = buildOrganisationVolumePropreColumnMap(headers);
  const brancheMap = buildOrganisationVolumeBrancheColumnMap(headers);

  if (propreMap.size > 0 && brancheMap.size > 0) {
    if (normalizedName.includes("4 niveaux") || normalizedName.includes("4niveaux")) {
      return "branche";
    }
    if (normalizedName.includes("perso")) return "propre";
    return propreMap.size >= brancheMap.size ? "propre" : "branche";
  }
  if (brancheMap.size > 0) return "branche";
  if (propreMap.size > 0) return "propre";
  return null;
}

export function pickOrganisationVolumesSheetName(sheetNames: string[]): string | undefined {
  if (sheetNames.length === 0) return undefined;
  for (const hint of [
    ORGANISATION_VOLUMES_PROPRE_SHEET_HINT,
    ORGANISATION_VOLUMES_BRANCHE_SHEET_HINT,
  ]) {
    const normalizedHint = normalizeHeader(hint);
    const exact = sheetNames.find((name) => normalizeHeader(name) === normalizedHint);
    if (exact) return exact;
  }
  const partial = sheetNames.find((name) => normalizeHeader(name).includes("vavc"));
  return partial ?? sheetNames[0];
}

function resolveConsultantNameKey(headers: string[]): string | undefined {
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (CONSULTANT_NAME_ALIASES.some((alias) => normalized === alias || normalized.includes(alias))) {
      return header;
    }
  }
  return headers[0];
}

function parseConsultantName(raw: string): { nom: string; prenom: string; displayName: string } | null {
  const cleaned = stripMonOrganisationDisplayPrefix(raw);
  if (!cleaned) return null;
  const parsed = parseNomCompletInvestisseur(cleaned);
  if (!parsed) return null;
  return {
    nom: parsed.nom,
    prenom: parsed.prenom,
    displayName: `${parsed.prenom} ${parsed.nom}`.trim(),
  };
}

function readPropreVolumeForExercice(
  raw: Record<string, unknown>,
  column: { combined?: string; va?: string; vaa?: string }
): number | null {
  if (column.combined) {
    const combined = parseVolumeCell(raw[column.combined]);
    if (combined != null) return combined;
  }
  const va = column.va ? parseVolumeCell(raw[column.va]) : null;
  const vaa = column.vaa ? parseVolumeCell(raw[column.vaa]) : null;
  if (va == null && vaa == null) return null;
  return (va ?? 0) + (vaa ?? 0);
}

function contactRowKey(nom: string, prenom: string): string {
  return `${nom}\u0000${prenom}`;
}

function upsertImportCell(
  cells: OrganisationVolumeImportCell[],
  exerciceLabel: string,
  patch: Pick<OrganisationVolumeImportCell, "volumePropre" | "volumeBranche">
): void {
  const existing = cells.find((cell) => cell.exerciceLabel === exerciceLabel);
  if (existing) {
    if (patch.volumePropre != null) existing.volumePropre = patch.volumePropre;
    if (patch.volumeBranche != null) existing.volumeBranche = patch.volumeBranche;
    return;
  }
  cells.push({
    exerciceLabel,
    volumePropre: patch.volumePropre,
    volumeBranche: patch.volumeBranche,
  });
}

export function parseOrganisationVolumesRows(
  rawRows: Record<string, unknown>[],
  kind: OrganisationVolumeSheetKind = "propre"
): OrganisationVolumeImportRow[] {
  if (rawRows.length === 0) return [];
  const headers = Object.keys(rawRows[0] ?? {});
  const nameKey = resolveConsultantNameKey(headers);
  const propreMap = buildOrganisationVolumePropreColumnMap(headers);
  const brancheMap = buildOrganisationVolumeBrancheColumnMap(headers);
  const resolvedKind =
    kind === "branche" && brancheMap.size > 0
      ? "branche"
      : propreMap.size > 0
        ? "propre"
        : brancheMap.size > 0
          ? "branche"
          : kind;

  const exerciceLabels =
    resolvedKind === "branche"
      ? [...brancheMap.keys()].sort()
      : [...propreMap.keys()].sort();

  const rows: OrganisationVolumeImportRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]!;
    const nameRaw = cellStr(nameKey ? raw[nameKey] : "");
    const parsedName = parseConsultantName(nameRaw);
    const cells: OrganisationVolumeImportCell[] = [];

    for (const exerciceLabel of exerciceLabels) {
      if (resolvedKind === "branche") {
        const header = brancheMap.get(exerciceLabel);
        if (!header) continue;
        const volumeBranche = parseVolumeCell(raw[header]);
        if (volumeBranche == null) continue;
        cells.push({ exerciceLabel, volumeBranche });
        continue;
      }

      const column = propreMap.get(exerciceLabel);
      if (!column) continue;
      const volumePropre = readPropreVolumeForExercice(raw, column);
      if (volumePropre == null) continue;
      cells.push({ exerciceLabel, volumePropre });
    }

    rows.push({
      rowIndex: i + 2,
      displayName: parsedName?.displayName ?? nameRaw,
      nom: parsedName?.nom ?? "",
      prenom: parsedName?.prenom ?? "",
      cells,
    });
  }

  return rows;
}

export function mergeOrganisationVolumeImportRows(
  rowSets: OrganisationVolumeImportRow[][]
): OrganisationVolumeImportRow[] {
  const merged = new Map<string, OrganisationVolumeImportRow>();

  for (const rows of rowSets) {
    for (const row of rows) {
      if (!row.nom || !row.prenom) continue;
      const key = contactRowKey(row.nom, row.prenom);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...row,
          cells: row.cells.map((cell) => ({ ...cell })),
        });
        continue;
      }
      existing.rowIndex = Math.min(existing.rowIndex, row.rowIndex);
      if (!existing.displayName && row.displayName) existing.displayName = row.displayName;
      for (const cell of row.cells) {
        upsertImportCell(existing.cells, cell.exerciceLabel, cell);
      }
    }
  }

  return [...merged.values()].sort(
    (a, b) => a.rowIndex - b.rowIndex || a.displayName.localeCompare(b.displayName, "fr")
  );
}

export function parseOrganisationVolumesWorkbookSheets(
  sheets: { sheetName: string; rawRows: Record<string, unknown>[] }[]
): OrganisationVolumeImportRow[] {
  const parsedSets: OrganisationVolumeImportRow[][] = [];

  for (const { sheetName, rawRows } of sheets) {
    if (rawRows.length === 0) continue;
    const headers = Object.keys(rawRows[0] ?? {});
    const kind = detectOrganisationVolumeSheetKind(sheetName, headers);
    if (!kind) continue;
    parsedSets.push(parseOrganisationVolumesRows(rawRows, kind));
  }

  return mergeOrganisationVolumeImportRows(parsedSets);
}

function buildLineKey(row: Pick<OrganisationVolumeImportRow, "rowIndex" | "nom" | "prenom">): string {
  return `${row.rowIndex}:${row.nom}:${row.prenom}`;
}

function cellHasVolume(cell: OrganisationVolumeImportCell): boolean {
  return cell.volumePropre != null || cell.volumeBranche != null;
}

export function buildOrganisationVolumesImportPreview(
  rows: OrganisationVolumeImportRow[],
  contacts: Contact[]
): OrganisationVolumeImportPreviewLine[] {
  return rows.map((row) => {
    const lineKey = buildLineKey(row);
    if (!row.nom || !row.prenom) {
      return {
        ...row,
        lineKey,
        status: "invalid",
        statusMessage: "Nom et prénom non reconnus",
      };
    }
    if (row.cells.length === 0 || !row.cells.some(cellHasVolume)) {
      return {
        ...row,
        lineKey,
        status: "invalid",
        statusMessage: "Aucun volume dans le fichier",
      };
    }
    const contact = findContactByNameKeyWithSwap(contacts, row.nom, row.prenom);
    if (!contact?.id) {
      return {
        ...row,
        lineKey,
        status: "unmatched",
        statusMessage: "Contact introuvable en base",
      };
    }
    const propreCount = row.cells.filter((cell) => cell.volumePropre != null).length;
    const brancheCount = row.cells.filter((cell) => cell.volumeBranche != null).length;
    const parts: string[] = [];
    if (propreCount > 0) parts.push(`${propreCount} perso`);
    if (brancheCount > 0) parts.push(`${brancheCount} orga`);
    return {
      ...row,
      lineKey,
      status: "ready",
      statusMessage: parts.join(" · ") || `${row.cells.length} exercice${row.cells.length > 1 ? "s" : ""}`,
      contactId: contact.id,
    };
  });
}

export function summarizeOrganisationVolumesImportPreview(
  lines: OrganisationVolumeImportPreviewLine[]
): OrganisationVolumeImportSummary {
  const summary: OrganisationVolumeImportSummary = {
    total: lines.length,
    ready: 0,
    invalid: 0,
    unmatched: 0,
    cellCount: 0,
  };
  for (const line of lines) {
    if (line.status === "ready") {
      summary.ready += 1;
      summary.cellCount += line.cells.filter(cellHasVolume).length;
    } else if (line.status === "invalid") {
      summary.invalid += 1;
    } else if (line.status === "unmatched") {
      summary.unmatched += 1;
    }
  }
  return summary;
}

export function defaultSelectedOrganisationVolumeLineKeys(
  lines: OrganisationVolumeImportPreviewLine[]
): Set<string> {
  return new Set(lines.filter((line) => line.status === "ready").map((line) => line.lineKey));
}

export function flattenOrganisationVolumesImportEntries(
  lines: OrganisationVolumeImportPreviewLine[],
  selectedLineKeys: ReadonlySet<string>
): {
  contactId: number;
  exerciceLabel: string;
  volumePropre?: number;
  volumeBranche?: number;
}[] {
  const entries: {
    contactId: number;
    exerciceLabel: string;
    volumePropre?: number;
    volumeBranche?: number;
  }[] = [];
  for (const line of lines) {
    if (line.status !== "ready" || !line.contactId || !selectedLineKeys.has(line.lineKey)) {
      continue;
    }
    for (const cell of line.cells) {
      if (!cellHasVolume(cell)) continue;
      entries.push({
        contactId: line.contactId,
        exerciceLabel: cell.exerciceLabel,
        ...(cell.volumePropre != null ? { volumePropre: cell.volumePropre } : {}),
        ...(cell.volumeBranche != null ? { volumeBranche: cell.volumeBranche } : {}),
      });
    }
  }
  return entries;
}

export function formatOrganisationVolumeImportCellPreview(
  cell: OrganisationVolumeImportCell
): string {
  const parts: string[] = [];
  if (cell.volumePropre != null) parts.push(`P ${cell.volumePropre}`);
  if (cell.volumeBranche != null) parts.push(`O ${cell.volumeBranche}`);
  return `${cell.exerciceLabel}: ${parts.join(" / ")}`;
}
