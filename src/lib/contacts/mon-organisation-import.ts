import type { Contact } from "@/lib/api/tauri-contacts";
import {
  createContact,
  getAllContacts,
  updateContact,
  type NewContact,
} from "@/lib/api/tauri-contacts";
import {
  beginImportTransaction,
  commitImportTransaction,
  rollbackImportTransaction,
} from "@/lib/api/tauri-import-transaction";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";
import {
  contactToUpdatePayload,
  normalizeImportTelephone,
  normalizeImportPlaceName,
  parseDateInscriptionFromNotes,
} from "@/lib/contacts/contact-form-utils";
import { upsertFilleulDossierDatesFromImport } from "@/lib/organisation/organisation-filleul-dossier";
import { unwrapImportCell } from "@/lib/contacts/import-row";
import { parseNomCompletInvestisseur } from "@/lib/contacts/investor-name-parse";
import {
  normalizeEmail,
  normalizePhone,
} from "@/lib/contacts/duplicate-identity";
import {
  buildContactIdMap,
  contactNameKey,
  contactNameKeyCanonical,
  findContactByNameKeyWithSwap,
  lookupParrainId,
} from "@/lib/contacts/name-match";
import { unixToDateInput } from "@/lib/dates/calendar-date";
import {
  isoToDateInput,
  parseImportDate,
} from "@/lib/contacts/parse-import-date";
import { runFullEtiquettesRecalc } from "@/lib/etiquettes/sync-etiquettes-auto";

const IMPORT_SAVE_OPTS = { skipPostSaveHooks: true } as const;

export const MON_ORGANISATION_SHEET_NAME = "Mon Organisation";

const COLUMN_ALIASES = {
  nom: ["^nom$"],
  prenom: ["^prenom$", "^prénom$"],
  niveau: ["niveau hierarchique", "niveau hiérarchique"],
  parrain: ["^parrain$"],
  dateEntree: ["date entree", "date entrée"],
  adresse: ["^adresse$"],
  codePostal: ["code postal"],
  ville: ["^ville$"],
  pays: ["^pays$"],
  email: ["mail information", "^email$", "^mail$"],
  telephone: ["telephone mobile", "téléphone mobile", "^telephone$", "^téléphone$"],
} as const;

export type MonOrganisationRow = {
  rowIndex: number;
  niveau: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  dateInscriptionIso?: string;
  dateDernierContactFilleulIso?: string;
  parrainNom: string;
  parrainPrenom: string;
  parrainLabel: string;
  filleulCategorie: string;
};

export type MonOrganisationImportLineStatus =
  | "ready"
  | "invalid"
  | "duplicate_crm"
  | "duplicate_csv"
  | "imported";

export type MonOrganisationPreviewLine = MonOrganisationRow & {
  lineKey: string;
  status: MonOrganisationImportLineStatus;
  statusMessage: string;
  contactId?: number;
  parrainId?: number;
  parrainWillCreate?: boolean;
};

export type MonOrganisationImportPreviewSummary = {
  total: number;
  ready: number;
  invalid: number;
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

function resolveColumnKey(
  headers: string[],
  aliases: readonly string[]
): string | undefined {
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (
      aliases.some((alias) => {
        if (alias.startsWith("^") && alias.endsWith("$")) {
          return normalized === alias.slice(1, -1);
        }
        return normalized === alias || normalized.includes(alias);
      })
    ) {
      return header;
    }
  }
  return undefined;
}

function cellStr(value: unknown): string {
  return String(unwrapImportCell(value) ?? "").trim();
}

/** Retire les préfixes export « /__ (01) », « /____ (02) »… */
export function stripMonOrganisationDisplayPrefix(full: string): string {
  return full
    .trim()
    .replace(/^[/_\s]+(?:\(\d{2}\)\s*)?/i, "")
    .trim();
}

export function parseMonOrganisationParrain(
  raw: string
): { nom: string; prenom: string; label: string } | null {
  const cleaned = stripMonOrganisationDisplayPrefix(raw);
  if (!cleaned || cleaned === "-") return null;
  const parsed = parseNomCompletInvestisseur(cleaned);
  if (!parsed) return null;
  return {
    nom: parsed.nom,
    prenom: parsed.prenom,
    label: `${parsed.prenom} ${parsed.nom}`,
  };
}

export function cleanMonOrganisationTelephone(raw: string): string {
  return normalizeImportTelephone(raw);
}

function parseNiveauSortKey(niveau: string): number {
  const digits = niveau.replace(/\D/g, "");
  if (!digits) return 999;
  return parseInt(digits, 10);
}

function buildLineKey(row: Pick<MonOrganisationRow, "rowIndex" | "nom" | "prenom">): string {
  return `${row.rowIndex}:${contactNameKey(row.nom, row.prenom)}`;
}

function parseMonOrganisationDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return parseImportDate(value);
  }
  const s = cellStr(value);
  if (!s) return undefined;
  const fr = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) {
    const day = parseInt(fr[1]!, 10);
    const month = parseInt(fr[2]!, 10);
    const year = parseInt(fr[3]!, 10);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return parseImportDate(value);
}

export function pickMonOrganisationSheetName(sheetNames: string[]): string | undefined {
  if (sheetNames.length === 0) return undefined;
  const exact = sheetNames.find(
    (n) => normalizeHeader(n) === normalizeHeader(MON_ORGANISATION_SHEET_NAME)
  );
  return exact ?? sheetNames[0];
}

export function parseMonOrganisationRows(
  rawRows: Record<string, unknown>[]
): MonOrganisationRow[] {
  if (rawRows.length === 0) return [];
  const headers = Object.keys(rawRows[0] ?? {});
  const keys = {
    nom: resolveColumnKey(headers, COLUMN_ALIASES.nom),
    prenom: resolveColumnKey(headers, COLUMN_ALIASES.prenom),
    niveau: resolveColumnKey(headers, COLUMN_ALIASES.niveau),
    parrain: resolveColumnKey(headers, COLUMN_ALIASES.parrain),
    dateEntree: resolveColumnKey(headers, COLUMN_ALIASES.dateEntree),
    adresse: resolveColumnKey(headers, COLUMN_ALIASES.adresse),
    codePostal: resolveColumnKey(headers, COLUMN_ALIASES.codePostal),
    ville: resolveColumnKey(headers, COLUMN_ALIASES.ville),
    pays: resolveColumnKey(headers, COLUMN_ALIASES.pays),
    email: resolveColumnKey(headers, COLUMN_ALIASES.email),
    telephone: resolveColumnKey(headers, COLUMN_ALIASES.telephone),
  };

  const rows: MonOrganisationRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]!;
    const nom = cellStr(keys.nom ? raw[keys.nom] : "");
    const prenom = cellStr(keys.prenom ? raw[keys.prenom] : "");
    const parrainRaw = cellStr(keys.parrain ? raw[keys.parrain] : "");
    const parrainParsed = parseMonOrganisationParrain(parrainRaw);
    rows.push({
      rowIndex: i + 2,
      niveau: cellStr(keys.niveau ? raw[keys.niveau] : ""),
      nom,
      prenom,
      email: cellStr(keys.email ? raw[keys.email] : "").toLowerCase(),
      telephone: cleanMonOrganisationTelephone(
        cellStr(keys.telephone ? raw[keys.telephone] : "")
      ),
      adresse: cellStr(keys.adresse ? raw[keys.adresse] : ""),
      codePostal: cellStr(keys.codePostal ? raw[keys.codePostal] : ""),
      ville: normalizeImportPlaceName(keys.ville ? raw[keys.ville] : ""),
      pays: normalizeImportPlaceName(keys.pays ? raw[keys.pays] : ""),
      dateInscriptionIso: parseMonOrganisationDate(keys.dateEntree ? raw[keys.dateEntree] : undefined),
      dateDernierContactFilleulIso: undefined,
      parrainNom: parrainParsed?.nom ?? "",
      parrainPrenom: parrainParsed?.prenom ?? "",
      parrainLabel: parrainParsed?.label ?? parrainRaw,
      filleulCategorie: "FILLEUL",
    });
  }
  return rows;
}

function isSamePerson(
  aNom: string,
  aPrenom: string,
  bNom: string,
  bPrenom: string
): boolean {
  return contactNameKeyCanonical(aNom, aPrenom) === contactNameKeyCanonical(bNom, bPrenom);
}

export function buildMonOrganisationImportNameKeys(
  lines: MonOrganisationPreviewLine[]
): Set<string> {
  const keys = new Set<string>();
  for (const line of lines) {
    const nom = line.nom.trim();
    const prenom = line.prenom.trim();
    if (!nom || !prenom) continue;
    keys.add(contactNameKey(nom, prenom));
    keys.add(contactNameKey(prenom, nom));
  }
  return keys;
}

function assessParrain(
  line: MonOrganisationRow,
  contacts: Contact[],
  contactsMap: Map<string, number>,
  importNameKeys: Set<string>
): { parrainId?: number; parrainWillCreate?: boolean } {
  const { parrainNom, parrainPrenom, nom, prenom } = line;
  if (!parrainNom || !parrainPrenom) return {};
  if (isSamePerson(parrainNom, parrainPrenom, nom, prenom)) return {};

  const lookup = lookupParrainId(
    parrainNom,
    parrainPrenom,
    contactsMap,
    contacts.filter((c): c is Contact & { id: number } => !!c.id)
  );
  if (lookup.id) return { parrainId: lookup.id };

  const inFile =
    importNameKeys.has(contactNameKey(parrainNom, parrainPrenom)) ||
    importNameKeys.has(contactNameKey(parrainPrenom, parrainNom));
  if (inFile) return { parrainWillCreate: true };

  return { parrainWillCreate: true };
}

export function reassessMonOrganisationPreviewLine(
  line: MonOrganisationPreviewLine,
  contacts: Contact[],
  seenInFile: Map<string, number>,
  importNameKeys: Set<string>
): MonOrganisationPreviewLine {
  if (line.status === "imported") return line;

  const nom = line.nom.trim();
  const prenom = line.prenom.trim();
  if (!nom || !prenom) {
    return {
      ...line,
      status: "invalid",
      statusMessage: "Nom et prénom obligatoires",
      contactId: undefined,
      parrainId: undefined,
      parrainWillCreate: undefined,
    };
  }

  const canonical = contactNameKeyCanonical(nom, prenom);
  const dupCount = seenInFile.get(canonical) ?? 0;
  if (dupCount > 1) {
    return {
      ...line,
      status: "duplicate_csv",
      statusMessage: "Doublon dans le fichier",
      contactId: undefined,
    };
  }

  const existing = findContactByNameKeyWithSwap(contacts, nom, prenom);
  if (existing?.id) {
    return {
      ...line,
      status: "duplicate_crm",
      statusMessage: `Déjà en base (${existing.prenom} ${existing.nom})`,
      contactId: existing.id,
      parrainId: undefined,
      parrainWillCreate: undefined,
    };
  }

  const contactsMap = buildContactIdMap(
    contacts.filter((c): c is Contact & { id: number } => !!c.id)
  );
  const parrainInfo = assessParrain(line, contacts, contactsMap, importNameKeys);

  return {
    ...line,
    nom,
    prenom,
    status: "ready",
    statusMessage: parrainInfo.parrainWillCreate
      ? `Parrain à créer : ${line.parrainLabel || "—"}`
      : parrainInfo.parrainId
        ? `Parrain : ${line.parrainLabel}`
        : "Sans parrain",
    contactId: undefined,
    parrainId: parrainInfo.parrainId,
    parrainWillCreate: parrainInfo.parrainWillCreate,
  };
}

export function buildMonOrganisationPreviewSeenInFileFromLines(
  lines: MonOrganisationPreviewLine[]
): Map<string, number> {
  const seen = new Map<string, number>();
  for (const line of lines) {
    if (line.status === "imported") continue;
    const key = contactNameKeyCanonical(line.nom, line.prenom);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return seen;
}

export function buildMonOrganisationImportPreview(
  rows: MonOrganisationRow[],
  contacts: Contact[]
): MonOrganisationPreviewLine[] {
  const base: MonOrganisationPreviewLine[] = rows.map((row) => ({
    ...row,
    lineKey: buildLineKey(row),
    status: "ready" as const,
    statusMessage: "",
  }));
  const seen = buildMonOrganisationPreviewSeenInFileFromLines(base);
  const importNameKeys = buildMonOrganisationImportNameKeys(base);
  return base.map((line) =>
    reassessMonOrganisationPreviewLine(line, contacts, seen, importNameKeys)
  );
}

export function patchMonOrganisationPreviewLines(
  lines: MonOrganisationPreviewLine[],
  patches: Map<string, Partial<MonOrganisationRow>>,
  contacts: Contact[]
): MonOrganisationPreviewLine[] {
  const merged = lines.map((line) => {
    const patch = patches.get(line.lineKey);
    if (!patch) return line;
    const next = { ...line, ...patch, lineKey: line.lineKey };
    if (patch.parrainLabel !== undefined || patch.parrainNom !== undefined) {
      const parsed = parseMonOrganisationParrain(
        patch.parrainLabel ?? `${patch.parrainNom ?? next.parrainNom} ${patch.parrainPrenom ?? next.parrainPrenom}`.trim()
      );
      if (parsed) {
        next.parrainNom = parsed.nom;
        next.parrainPrenom = parsed.prenom;
        next.parrainLabel = parsed.label;
      }
    }
    if (patch.telephone !== undefined) {
      next.telephone = cleanMonOrganisationTelephone(patch.telephone);
    }
    if (patch.ville !== undefined) {
      next.ville = normalizeImportPlaceName(patch.ville);
    }
    if (patch.pays !== undefined) {
      next.pays = normalizeImportPlaceName(patch.pays);
    }
    return next;
  });
  const seen = buildMonOrganisationPreviewSeenInFileFromLines(merged);
  const importNameKeys = buildMonOrganisationImportNameKeys(merged);
  return merged.map((line) =>
    reassessMonOrganisationPreviewLine(line, contacts, seen, importNameKeys)
  );
}

export function summarizeMonOrganisationImportPreview(
  lines: MonOrganisationPreviewLine[]
): MonOrganisationImportPreviewSummary {
  const summary: MonOrganisationImportPreviewSummary = {
    total: lines.length,
    ready: 0,
    invalid: 0,
    duplicateCrm: 0,
    duplicateCsv: 0,
    imported: 0,
  };
  for (const line of lines) {
    switch (line.status) {
      case "ready":
        summary.ready += 1;
        break;
      case "invalid":
        summary.invalid += 1;
        break;
      case "duplicate_crm":
        summary.duplicateCrm += 1;
        break;
      case "duplicate_csv":
        summary.duplicateCsv += 1;
        break;
      case "imported":
        summary.imported += 1;
        break;
    }
  }
  return summary;
}

export type MonOrganisationImportPreviewSection = {
  status: MonOrganisationImportLineStatus;
  label: string;
  lines: MonOrganisationPreviewLine[];
};

/** Ordre d'affichage des groupes dans l'aperçu import. */
export const MON_ORGANISATION_IMPORT_PREVIEW_SECTION_ORDER: ReadonlyArray<{
  status: MonOrganisationImportLineStatus;
  label: string;
}> = [
  { status: "ready", label: "À importer" },
  { status: "duplicate_crm", label: "Déjà en base" },
  { status: "duplicate_csv", label: "Doublon fichier" },
  { status: "invalid", label: "Invalide" },
  { status: "imported", label: "Importé" },
];

export function isMonOrganisationLineSelectable(line: MonOrganisationPreviewLine): boolean {
  return line.status === "ready" || (line.status === "duplicate_crm" && line.contactId != null);
}

export function defaultSelectedMonOrganisationLineKeys(
  lines: MonOrganisationPreviewLine[]
): Set<string> {
  return new Set(lines.filter(isMonOrganisationLineSelectable).map((l) => l.lineKey));
}

export function groupMonOrganisationPreviewLines(
  lines: MonOrganisationPreviewLine[]
): MonOrganisationImportPreviewSection[] {
  const byStatus = new Map<MonOrganisationImportLineStatus, MonOrganisationPreviewLine[]>();
  for (const line of lines) {
    const bucket = byStatus.get(line.status) ?? [];
    bucket.push(line);
    byStatus.set(line.status, bucket);
  }
  return MON_ORGANISATION_IMPORT_PREVIEW_SECTION_ORDER.map((section) => ({
    ...section,
    lines: (byStatus.get(section.status) ?? []).sort(
      (a, b) =>
        parseNiveauSortKey(a.niveau) - parseNiveauSortKey(b.niveau) || a.rowIndex - b.rowIndex
    ),
  })).filter((section) => section.lines.length > 0);
}

export type MonOrganisationCrmDiffHighlightField =
  | "nom"
  | "prenom"
  | "email"
  | "telephone"
  | "adresse"
  | "codePostal"
  | "ville"
  | "pays"
  | "dateInscriptionIso"
  | "dateDernierContactFilleulIso"
  | "parrainLabel"
  | "filleulCategorie";

export type MonOrganisationCrmDiffFieldHighlight = "fill" | "change";

export type MonOrganisationCrmDiffFieldHighlights = Partial<
  Record<MonOrganisationCrmDiffHighlightField, MonOrganisationCrmDiffFieldHighlight>
>;

function strFieldNorm(value: string | undefined | null): string {
  return (value ?? "").trim();
}

function markCrmDiffHighlight(
  highlights: MonOrganisationCrmDiffFieldHighlights,
  field: MonOrganisationCrmDiffHighlightField,
  fileValue: string | undefined,
  crmValue: string | undefined,
  normalizer: (value: string | undefined | null) => string = strFieldNorm
): void {
  const incoming = normalizer(fileValue);
  if (!incoming) return;
  const prev = normalizer(crmValue);
  if (incoming === prev) return;
  highlights[field] = prev ? "change" : "fill";
}

function markCrmDiffDateHighlight(
  highlights: MonOrganisationCrmDiffFieldHighlights,
  field: "dateInscriptionIso" | "dateDernierContactFilleulIso",
  fileIso: string | undefined,
  crmDateInput: string
): void {
  const incoming = isoToDateInput(fileIso);
  if (!incoming) return;
  if (incoming === crmDateInput) return;
  highlights[field] = crmDateInput ? "change" : "fill";
}

/** Date d'inscription telle qu'affichée en fiche contact (colonne ou notes). */
function resolveCrmInscriptionDateInput(contact: Contact): string {
  const fromColumn = contact.date_inscription_filleul
    ? unixToDateInput(contact.date_inscription_filleul)
    : "";
  if (fromColumn) return fromColumn;
  const fromNotes = parseDateInscriptionFromNotes(contact.notes);
  return fromNotes ? isoToDateInput(fromNotes) : "";
}

function parrainContactLabel(contacts: Contact[], parrainId?: number | null): string {
  if (!parrainId) return "";
  const parrain = contacts.find((c) => c.id === parrainId);
  if (!parrain) return "";
  return `${parrain.prenom} ${parrain.nom}`.trim();
}

/** Écarts fichier vs fiche CRM (aperçu « Déjà en base »). */
export function getMonOrganisationCrmDiffFieldHighlights(
  line: MonOrganisationPreviewLine,
  existing: Contact,
  contacts: Contact[]
): MonOrganisationCrmDiffFieldHighlights {
  const highlights: MonOrganisationCrmDiffFieldHighlights = {};

  markCrmDiffHighlight(highlights, "nom", line.nom, existing.nom);
  markCrmDiffHighlight(highlights, "prenom", line.prenom, existing.prenom);
  markCrmDiffHighlight(highlights, "email", line.email, existing.email, normalizeEmail);
  markCrmDiffHighlight(
    highlights,
    "telephone",
    line.telephone,
    existing.telephone,
    normalizePhone
  );
  markCrmDiffHighlight(highlights, "adresse", line.adresse, existing.adresse);
  markCrmDiffHighlight(highlights, "codePostal", line.codePostal, existing.code_postal);
  markCrmDiffHighlight(highlights, "ville", line.ville, existing.ville, normalizeImportPlaceName);
  markCrmDiffHighlight(highlights, "pays", line.pays, existing.pays, normalizeImportPlaceName);
  markCrmDiffDateHighlight(
    highlights,
    "dateInscriptionIso",
    line.dateInscriptionIso,
    resolveCrmInscriptionDateInput(existing)
  );
  markCrmDiffDateHighlight(
    highlights,
    "dateDernierContactFilleulIso",
    line.dateDernierContactFilleulIso,
    existing.date_dernier_contact_filleul
      ? unixToDateInput(existing.date_dernier_contact_filleul)
      : ""
  );
  markCrmDiffHighlight(
    highlights,
    "filleulCategorie",
    line.filleulCategorie,
    existing.filleul_categorie ?? undefined
  );

  const fileParrain = strFieldNorm(line.parrainLabel);
  const crmParrain = strFieldNorm(parrainContactLabel(contacts, existing.parrain_id));
  if (fileParrain && fileParrain !== crmParrain) {
    highlights.parrainLabel = crmParrain ? "change" : "fill";
  }

  return highlights;
}

function pickEnrichField(
  fileValue: string | undefined,
  crmValue: string | undefined | null
): string | undefined {
  const incoming = (fileValue ?? "").trim();
  if (incoming) return incoming;
  return crmValue?.trim() || undefined;
}

function buildMonOrganisationEnrichPayload(
  line: MonOrganisationPreviewLine,
  existing: Contact,
  parrainId: number | undefined
): Partial<NewContact> {
  const payload: Partial<NewContact> = {
    email: pickEnrichField(line.email, existing.email),
    telephone: pickEnrichField(line.telephone, existing.telephone),
    adresse: pickEnrichField(line.adresse, existing.adresse),
    code_postal: pickEnrichField(line.codePostal, existing.code_postal),
    ville: pickEnrichField(line.ville, existing.ville)
      ? normalizeImportPlaceName(pickEnrichField(line.ville, existing.ville))
      : existing.ville || undefined,
    pays: pickEnrichField(line.pays, existing.pays)
      ? normalizeImportPlaceName(pickEnrichField(line.pays, existing.pays))
      : existing.pays || undefined,
    filleul_categorie: line.filleulCategorie || existing.filleul_categorie || undefined,
  };

  if (line.dateDernierContactFilleulIso) {
    payload.date_dernier_contact_filleul = isoToDateInput(line.dateDernierContactFilleulIso);
  }

  if (line.parrainNom && line.parrainPrenom && parrainId) {
    payload.parrain_id = parrainId;
  }

  return payload;
}

function buildNewContactPayload(line: MonOrganisationPreviewLine): NewContact {
  return {
    nom: line.nom,
    prenom: line.prenom,
    email: line.email || undefined,
    telephone: line.telephone || undefined,
    adresse: line.adresse || undefined,
    code_postal: line.codePostal || undefined,
    ville: line.ville || undefined,
    pays: line.pays || undefined,
    categorie: "AUCUN",
    filleul_categorie: line.filleulCategorie || "FILLEUL",
    statut_suivi: "ACTIF",
    date_dernier_contact_filleul: line.dateDernierContactFilleulIso
      ? isoToDateInput(line.dateDernierContactFilleulIso)
      : undefined,
    type_invitation_filleul: undefined,
    presence_invitation_filleul: undefined,
    notes: undefined,
  };
}

async function ensureParrainContact(
  line: MonOrganisationPreviewLine,
  contactsMap: Map<string, number>,
  allContacts: Contact[]
): Promise<number | undefined> {
  const { parrainNom, parrainPrenom, nom, prenom } = line;
  if (!parrainNom || !parrainPrenom) return undefined;
  if (isSamePerson(parrainNom, parrainPrenom, nom, prenom)) return undefined;

  const lookup = lookupParrainId(
    parrainNom,
    parrainPrenom,
    contactsMap,
    allContacts.filter((c): c is Contact & { id: number } => !!c.id)
  );
  if (lookup.id) return lookup.id;

  const created = await createContact(
    {
      nom: parrainNom,
      prenom: parrainPrenom,
      categorie: "AUCUN",
      filleul_categorie: "FILLEUL",
      statut_suivi: "ACTIF",
    },
    IMPORT_SAVE_OPTS
  );
  const id = created.id!;
  contactsMap.set(contactNameKey(parrainNom, parrainPrenom), id);
  contactsMap.set(contactNameKey(parrainPrenom, parrainNom), id);
  allContacts.push(created);
  return id;
}

async function upgradeParrainFilleulCategorie(
  parrainId: number | undefined,
  allContacts: Contact[]
): Promise<void> {
  if (!parrainId) return;
  const parrain = allContacts.find((c) => c.id === parrainId);
  if (
    parrain &&
    (!parrain.filleul_categorie ||
      parrain.filleul_categorie === "PROSPECT_FILLEUL" ||
      parrain.filleul_categorie === "SUSPECT_FILLEUL")
  ) {
    await updateContact(
      parrainId,
      contactToUpdatePayload(parrain, { filleul_categorie: "FILLEUL" }),
      IMPORT_SAVE_OPTS
    );
  }
}

async function applyMonOrganisationEnrichLine(
  line: MonOrganisationPreviewLine,
  contactsMap: Map<string, number>,
  allContacts: Contact[]
): Promise<MonOrganisationPreviewLine> {
  const existing = allContacts.find((c) => c.id === line.contactId);
  if (!existing?.id) {
    throw new Error("Contact introuvable pour enrichissement");
  }

  const parrainId = await ensureParrainContact(line, contactsMap, allContacts);
  await updateContact(
    existing.id,
    contactToUpdatePayload(
      existing,
      buildMonOrganisationEnrichPayload(line, existing, parrainId)
    ),
    IMPORT_SAVE_OPTS
  );
  await upgradeParrainFilleulCategorie(parrainId, allContacts);

  if (line.dateInscriptionIso && existing.id != null) {
    await upsertFilleulDossierDatesFromImport(existing.id, {
      dateInscription: isoToDateInput(line.dateInscriptionIso),
    });
  }

  return {
    ...line,
    status: "imported",
    statusMessage: "Enrichi",
    contactId: existing.id,
    parrainId: parrainId ?? existing.parrain_id,
    parrainWillCreate: undefined,
  };
}

async function applyMonOrganisationLine(
  line: MonOrganisationPreviewLine,
  contactsMap: Map<string, number>,
  allContacts: Contact[]
): Promise<MonOrganisationPreviewLine> {
  const parrainId = await ensureParrainContact(line, contactsMap, allContacts);
  const payload = buildNewContactPayload(line);
  const created = await createContact({ ...payload, parrain_id: parrainId }, IMPORT_SAVE_OPTS);
  const id = created.id!;
  contactsMap.set(contactNameKey(line.nom, line.prenom), id);
  contactsMap.set(contactNameKey(line.prenom, line.nom), id);
  allContacts.push(created);

  await upgradeParrainFilleulCategorie(parrainId, allContacts);

  if (line.dateInscriptionIso) {
    await upsertFilleulDossierDatesFromImport(id, {
      dateInscription: isoToDateInput(line.dateInscriptionIso),
    });
  }

  return {
    ...line,
    status: "imported",
    statusMessage: "Importé",
    contactId: id,
    parrainId,
    parrainWillCreate: undefined,
  };
}

export async function applyMonOrganisationImport(
  lines: MonOrganisationPreviewLine[],
  selectedLineKeys: ReadonlySet<string>
): Promise<{ applied: number; failed: number; lines: MonOrganisationPreviewLine[] }> {
  const toImport = lines
    .filter((l) => isMonOrganisationLineSelectable(l) && selectedLineKeys.has(l.lineKey))
    .sort(
      (a, b) =>
        parseNiveauSortKey(a.niveau) - parseNiveauSortKey(b.niveau) ||
        a.rowIndex - b.rowIndex
    );

  if (toImport.length === 0) {
    return { applied: 0, failed: 0, lines: [...lines] };
  }

  let applied = 0;
  let failed = 0;
  const updated = [...lines];
  const lineIndex = new Map(updated.map((l, i) => [l.lineKey, i]));

  await beginImportTransaction();
  try {
    const allContacts = await getAllContacts();
    const contactsMap = buildContactIdMap(
      allContacts.filter((c): c is Contact & { id: number } => !!c.id)
    );

    const outcomes: {
      lineKey: string;
      result?: MonOrganisationPreviewLine;
      error?: string;
    }[] = [];

    for (const line of toImport) {
      try {
        const result =
          line.status === "duplicate_crm"
            ? await applyMonOrganisationEnrichLine(line, contactsMap, allContacts)
            : await applyMonOrganisationLine(line, contactsMap, allContacts);
        outcomes.push({ lineKey: line.lineKey, result });
        applied += 1;
      } catch (error) {
        outcomes.push({ lineKey: line.lineKey, error: String(error) });
        failed += 1;
      }
    }

    if (failed > 0) {
      await rollbackImportTransaction();
      for (const outcome of outcomes) {
        if (!outcome.error) continue;
        const idx = lineIndex.get(outcome.lineKey);
        if (idx === undefined) continue;
        updated[idx] = {
          ...updated[idx]!,
          status: "invalid",
          statusMessage: outcome.error,
        };
      }
      return { applied: 0, failed, lines: updated };
    }

    await commitImportTransaction();
    for (const outcome of outcomes) {
      if (!outcome.result) continue;
      const idx = lineIndex.get(outcome.lineKey);
      if (idx !== undefined) updated[idx] = outcome.result;
    }
    notifyContactsChanged();
    await runFullEtiquettesRecalc();
    return { applied, failed: 0, lines: updated };
  } catch (error) {
    await rollbackImportTransaction();
    throw error;
  }
}

export { dateInputToIso, isoToDateInput } from "@/lib/contacts/parse-import-date";
