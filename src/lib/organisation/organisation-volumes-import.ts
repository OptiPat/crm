import type { Contact } from "@/lib/api/tauri-contacts";
import { unwrapImportCell } from "@/lib/contacts/import-row";
import { parseNomCompletInvestisseur } from "@/lib/contacts/investor-name-parse";
import { findContactByNameKeyWithSwap } from "@/lib/contacts/name-match";
import { stripMonOrganisationDisplayPrefix } from "@/lib/contacts/mon-organisation-import";
import { parseImportMontantEuros } from "@/lib/investissements/parse-import-montant-euros";

export const ORGANISATION_VOLUMES_HISTORY_SHEET_HINT = "Historique des VAVC Perso";

const CONSULTANT_NAME_ALIASES = [
  "nom prénom du consultant",
  "nom prenom du consultant",
  "consultant",
];

const EXERCICE_LABEL_RE = /(\d{4}-\d{4})/;

export type OrganisationVolumeColumnMap = Map<
  string,
  { combined?: string; va?: string; vaa?: string }
>;

export type OrganisationVolumeImportCell = {
  exerciceLabel: string;
  volumePropre: number;
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

export function pickOrganisationVolumesSheetName(sheetNames: string[]): string | undefined {
  if (sheetNames.length === 0) return undefined;
  const hint = normalizeHeader(ORGANISATION_VOLUMES_HISTORY_SHEET_HINT);
  const exact = sheetNames.find((name) => normalizeHeader(name) === hint);
  if (exact) return exact;
  const partial = sheetNames.find((name) => normalizeHeader(name).includes("vavc"));
  return partial ?? sheetNames[0];
}

export function buildOrganisationVolumeColumnMap(
  headers: string[]
): OrganisationVolumeColumnMap {
  const map: OrganisationVolumeColumnMap = new Map();

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const match = EXERCICE_LABEL_RE.exec(header);
    if (!match) continue;
    const label = match[1]!;
    if (normalized.includes(" vs ")) continue;

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

function readVolumeForExercice(
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

export function parseOrganisationVolumesRows(
  rawRows: Record<string, unknown>[]
): OrganisationVolumeImportRow[] {
  if (rawRows.length === 0) return [];
  const headers = Object.keys(rawRows[0] ?? {});
  const nameKey = resolveConsultantNameKey(headers);
  const columnMap = buildOrganisationVolumeColumnMap(headers);
  const exerciceLabels = [...columnMap.keys()].sort();

  const rows: OrganisationVolumeImportRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]!;
    const nameRaw = cellStr(nameKey ? raw[nameKey] : "");
    const parsedName = parseConsultantName(nameRaw);
    const cells: OrganisationVolumeImportCell[] = [];

    for (const exerciceLabel of exerciceLabels) {
      const column = columnMap.get(exerciceLabel);
      if (!column) continue;
      const volume = readVolumeForExercice(raw, column);
      if (volume == null) continue;
      cells.push({ exerciceLabel, volumePropre: volume });
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

function buildLineKey(row: Pick<OrganisationVolumeImportRow, "rowIndex" | "nom" | "prenom">): string {
  return `${row.rowIndex}:${row.nom}:${row.prenom}`;
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
    if (row.cells.length === 0) {
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
    return {
      ...row,
      lineKey,
      status: "ready",
      statusMessage: `${row.cells.length} exercice${row.cells.length > 1 ? "s" : ""}`,
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
      summary.cellCount += line.cells.length;
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
): { contactId: number; exerciceLabel: string; volumePropre: number }[] {
  const entries: { contactId: number; exerciceLabel: string; volumePropre: number }[] = [];
  for (const line of lines) {
    if (line.status !== "ready" || !line.contactId || !selectedLineKeys.has(line.lineKey)) {
      continue;
    }
    for (const cell of line.cells) {
      entries.push({
        contactId: line.contactId,
        exerciceLabel: cell.exerciceLabel,
        volumePropre: cell.volumePropre,
      });
    }
  }
  return entries;
}
