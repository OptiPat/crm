import type { Contact } from "@/lib/api/tauri-contacts";
import * as XLSX from "xlsx";
import {
  createContact,
  getAllContacts,
  updateContact,
  updateContactFiscal,
  type NewContact,
} from "@/lib/api/tauri-contacts";
import { getFoyerById, updateFoyer } from "@/lib/api/tauri-foyers";
import {
  beginImportTransaction,
  commitImportTransaction,
  rollbackImportTransaction,
} from "@/lib/api/tauri-import-transaction";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";
import {
  contactToUpdatePayload,
  normalizeImportCivilite,
  normalizeImportStatut,
  normalizeImportTelephone,
  normalizeImportTmi,
  type ClientStatut,
} from "@/lib/contacts/contact-form-utils";
import {
  getPairIdentityConflictMessages,
  normalizeEmail,
  normalizePhone,
} from "@/lib/contacts/duplicate-identity";
import { unwrapImportCell } from "@/lib/contacts/import-row";
import {
  contactNameKeyCanonical,
  findContactByNameKeyWithSwap,
} from "@/lib/contacts/name-match";
import { parseImportDate } from "@/lib/contacts/parse-import-date";
import { pickFiscal, propagateFiscalToFoyerMembers } from "@/lib/foyers/foyer-fiscal-sync";
import { runFullEtiquettesRecalc } from "@/lib/etiquettes/sync-etiquettes-auto";

const IMPORT_SAVE_OPTS = { skipPostSaveHooks: true } as const;

const CLIENT_CATEGORY_RANK: Record<ClientStatut, number> = {
  AUCUN: 0,
  SUSPECT_CLIENT: 1,
  PROSPECT_CLIENT: 2,
  CLIENT: 3,
};

const CLIENT_PIPELINE_CATEGORIES = new Set<string>([
  "AUCUN",
  "CLIENT",
  "PROSPECT_CLIENT",
  "SUSPECT_CLIENT",
]);

/** Enrichissement : ne jamais rétrograder Client → Prospect/Suspect (aligné import legacy). */
export function pickEnrichClientCategory(
  existingCategorie: string | undefined,
  incoming: ClientStatut,
  existingFilleulCategorie?: string | null
): ClientStatut {
  if (
    existingFilleulCategorie &&
    existingFilleulCategorie !== "AUCUN" &&
    existingFilleulCategorie !== "FILLEUL_DESINSCRIT"
  ) {
    return (existingCategorie as ClientStatut) || "AUCUN";
  }
  if (existingCategorie && !CLIENT_PIPELINE_CATEGORIES.has(existingCategorie)) {
    return existingCategorie as ClientStatut;
  }
  const existing = existingCategorie as ClientStatut;
  const existingRank = CLIENT_CATEGORY_RANK[existing];
  const incomingRank = CLIENT_CATEGORY_RANK[incoming];
  if (existingRank === undefined) return incoming;
  if (incomingRank === undefined) return existing;
  return incomingRank > existingRank ? incoming : existing;
}

/** Enrichissement : conserver la date CRM si déjà renseignée. */
export function resolveEnrichDateNaissance(
  existingDateNaissanceUnix: number | undefined | null,
  lineDateIso: string | undefined
): string | undefined {
  if (existingDateNaissanceUnix) {
    return new Date(existingDateNaissanceUnix * 1000).toISOString();
  }
  return lineDateIso;
}

export const FINZZLE_CLIENTS_SHEET_HINT = "contacts";

export type FinzzleDuplicateAction = "consolidate" | "skip" | "merge";

export type FinzzleDuplicateMatchKind = "name" | "email" | "phone";

export const FINZZLE_CLIENT_CATEGORIE_OPTIONS = [
  { value: "CLIENT", label: "Client" },
  { value: "PROSPECT_CLIENT", label: "Prospect" },
  { value: "SUSPECT_CLIENT", label: "Suspect" },
  { value: "AUCUN", label: "Aucun" },
] as const;

export const FINZZLE_CLIENT_CIVILITE_OPTIONS = [
  { value: "", label: "—" },
  { value: "M", label: "Monsieur" },
  { value: "MME", label: "Madame" },
  { value: "AUTRE", label: "Autre" },
] as const;

export const FINZZLE_DUPLICATE_ACTION_OPTIONS = [
  { value: "consolidate", label: "Enrichir les doublons (défaut)" },
  { value: "skip", label: "Ignorer les doublons non sélectionnés" },
  { value: "merge", label: "Créer des homonymes (nouvelle fiche)" },
] as const;

const COLUMN_ALIASES = {
  statut: ["^statut$"],
  civilite: ["^civilite$", "^civilité$"],
  nom: ["^nom$"],
  prenom: ["^prenom$", "^prénom$"],
  dateNaissance: ["date de naissance", "date naissance"],
  telephone: ["^telephone$", "^téléphone$", "^tel$"],
  email: ["^email$", "^mail$", "e-mail", "courriel"],
  adresse: ["^adresse$"],
  codePostal: ["code postal"],
  ville: ["^ville$"],
  pays: ["^pays$"],
  sourceLead: ["origine du contact", "source du contact", "source lead", "origine contact"],
  tmi: ["^tmi$", "tranche marginale"],
} as const;

export type FinzzleClientRow = {
  rowIndex: number;
  categorie: ClientStatut;
  civilite: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  dateNaissanceIso?: string;
  sourceLead: string;
  tmi: string;
};

export type FinzzleClientImportLineStatus =
  | "ready"
  | "enrich"
  | "duplicate_homonym"
  | "duplicate_csv"
  | "invalid"
  | "imported";

export type FinzzleClientPreviewLine = FinzzleClientRow & {
  lineKey: string;
  status: FinzzleClientImportLineStatus;
  statusMessage: string;
  contactId?: number;
  duplicateMatch?: FinzzleDuplicateMatchKind;
  identityConflict?: boolean;
  conflictReasons?: string[];
  duplicateCsvRefRow?: number;
};

export type FinzzleClientImportPreviewSummary = {
  total: number;
  ready: number;
  enrich: number;
  duplicateHomonym: number;
  invalid: number;
  duplicateCsv: number;
  imported: number;
};

export type FinzzleClientFileDuplicateIndex = {
  names: Map<string, number>;
  emails: Map<string, number>;
  phones: Map<string, number>;
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

function parseFinzzleClientDate(value: unknown): string | undefined {
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

function buildLineKey(row: Pick<FinzzleClientRow, "rowIndex" | "nom" | "prenom">): string {
  return `${row.rowIndex}:${contactNameKeyCanonical(row.nom, row.prenom)}`;
}

function resolveCategorie(rawStatut: unknown): ClientStatut {
  return normalizeImportStatut(rawStatut) ?? "SUSPECT_CLIENT";
}

function lineIdentity(line: Pick<FinzzleClientRow, "email" | "telephone">) {
  return {
    email: line.email || undefined,
    telephone: line.telephone || undefined,
  };
}

export function buildFinzzleClientFileDuplicateIndex(
  lines: FinzzleClientPreviewLine[]
): FinzzleClientFileDuplicateIndex {
  const names = new Map<string, number>();
  const emails = new Map<string, number>();
  const phones = new Map<string, number>();

  for (const line of lines) {
    if (line.status === "imported") continue;
    const nameKey = contactNameKeyCanonical(line.nom, line.prenom);
    if (line.nom.trim() && line.prenom.trim()) {
      names.set(nameKey, (names.get(nameKey) ?? 0) + 1);
    }
    const emailKey = normalizeEmail(line.email);
    if (emailKey) emails.set(emailKey, (emails.get(emailKey) ?? 0) + 1);
    const phoneKey = normalizePhone(line.telephone);
    if (phoneKey.length >= 9) phones.set(phoneKey, (phones.get(phoneKey) ?? 0) + 1);
  }
  return { names, emails, phones };
}

function findCsvDuplicateRef(
  line: FinzzleClientPreviewLine,
  index: FinzzleClientFileDuplicateIndex,
  allLines: FinzzleClientPreviewLine[]
): number | undefined {
  const nameKey = contactNameKeyCanonical(line.nom, line.prenom);
  if (line.nom.trim() && line.prenom.trim() && (index.names.get(nameKey) ?? 0) > 1) {
    const first = allLines.find(
      (l) =>
        l.lineKey !== line.lineKey &&
        l.status !== "imported" &&
        contactNameKeyCanonical(l.nom, l.prenom) === nameKey
    );
    return first?.rowIndex;
  }
  const emailKey = normalizeEmail(line.email);
  if (emailKey && (index.emails.get(emailKey) ?? 0) > 1) {
    const first = allLines.find(
      (l) =>
        l.lineKey !== line.lineKey &&
        l.status !== "imported" &&
        normalizeEmail(l.email) === emailKey
    );
    return first?.rowIndex;
  }
  const phoneKey = normalizePhone(line.telephone);
  if (phoneKey.length >= 9 && (index.phones.get(phoneKey) ?? 0) > 1) {
    const first = allLines.find(
      (l) =>
        l.lineKey !== line.lineKey &&
        l.status !== "imported" &&
        normalizePhone(l.telephone) === phoneKey
    );
    return first?.rowIndex;
  }
  return undefined;
}

function findExistingContactForLine(
  line: Pick<FinzzleClientRow, "nom" | "prenom" | "email" | "telephone">,
  contacts: Contact[]
): { contact: Contact; match: FinzzleDuplicateMatchKind } | null {
  const nom = line.nom.trim();
  const prenom = line.prenom.trim();
  if (nom && prenom) {
    const byName = findContactByNameKeyWithSwap(contacts, nom, prenom);
    if (byName?.id) return { contact: byName, match: "name" };
  }

  const emailKey = normalizeEmail(line.email);
  if (emailKey) {
    const byEmail = contacts.find((c) => normalizeEmail(c.email) === emailKey);
    if (byEmail?.id) return { contact: byEmail, match: "email" };
  }

  const phoneKey = normalizePhone(line.telephone);
  if (phoneKey.length >= 9) {
    const byPhone = contacts.find((c) => normalizePhone(c.telephone) === phoneKey);
    if (byPhone?.id) return { contact: byPhone, match: "phone" };
  }

  return null;
}

async function applyImportTmi(
  target: { contactId?: number; foyerId?: number | null },
  tmiRaw: unknown
): Promise<void> {
  const tmi = normalizeImportTmi(tmiRaw);
  if (!tmi) return;
  if (target.foyerId) {
    const foyer = await getFoyerById(target.foyerId);
    await updateFoyer(foyer.id, {
      nom: foyer.nom,
      type_foyer: foyer.type_foyer,
      nombre_parts_fiscales: foyer.nombre_parts_fiscales,
      tranche_imposition: tmi,
      revenu_fiscal_reference: foyer.revenu_fiscal_reference,
      ir_net_a_payer: foyer.ir_net_a_payer,
      situation_patrimoniale: foyer.situation_patrimoniale,
      objectifs_patrimoniaux: foyer.objectifs_patrimoniaux,
      notes: foyer.notes,
    });
    await propagateFiscalToFoyerMembers(foyer.id, pickFiscal({ ...foyer, tranche_imposition: tmi }));
  } else if (target.contactId) {
    await updateContactFiscal(target.contactId, { tranche_imposition: tmi }, { silent: true });
  }
}

export function isFinzzleClientsExport(headers: string[]): boolean {
  const normalized = headers.map(normalizeHeader);
  const hasStatut = normalized.some((h) => h === "statut");
  const hasNom = normalized.some((h) => h === "nom");
  const hasPrenom = normalized.some((h) => h === "prenom");
  return hasStatut && hasNom && hasPrenom;
}

export function parseFinzzleClientRows(rawRows: Record<string, unknown>[]): FinzzleClientRow[] {
  if (rawRows.length === 0) return [];
  const headers = Object.keys(rawRows[0] ?? {});
  const keys = {
    statut: resolveColumnKey(headers, COLUMN_ALIASES.statut),
    civilite: resolveColumnKey(headers, COLUMN_ALIASES.civilite),
    nom: resolveColumnKey(headers, COLUMN_ALIASES.nom),
    prenom: resolveColumnKey(headers, COLUMN_ALIASES.prenom),
    dateNaissance: resolveColumnKey(headers, COLUMN_ALIASES.dateNaissance),
    telephone: resolveColumnKey(headers, COLUMN_ALIASES.telephone),
    email: resolveColumnKey(headers, COLUMN_ALIASES.email),
    adresse: resolveColumnKey(headers, COLUMN_ALIASES.adresse),
    codePostal: resolveColumnKey(headers, COLUMN_ALIASES.codePostal),
    ville: resolveColumnKey(headers, COLUMN_ALIASES.ville),
    pays: resolveColumnKey(headers, COLUMN_ALIASES.pays),
    sourceLead: resolveColumnKey(headers, COLUMN_ALIASES.sourceLead),
    tmi: resolveColumnKey(headers, COLUMN_ALIASES.tmi),
  };

  const rows: FinzzleClientRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]!;
    const statutRaw = keys.statut ? raw[keys.statut] : undefined;
    rows.push({
      rowIndex: i + 2,
      categorie: resolveCategorie(statutRaw),
      civilite: normalizeImportCivilite(keys.civilite ? raw[keys.civilite] : undefined) ?? "",
      nom: cellStr(keys.nom ? raw[keys.nom] : ""),
      prenom: cellStr(keys.prenom ? raw[keys.prenom] : ""),
      email: cellStr(keys.email ? raw[keys.email] : "").toLowerCase(),
      telephone: normalizeImportTelephone(keys.telephone ? raw[keys.telephone] : ""),
      adresse: cellStr(keys.adresse ? raw[keys.adresse] : ""),
      codePostal: cellStr(keys.codePostal ? raw[keys.codePostal] : ""),
      ville: cellStr(keys.ville ? raw[keys.ville] : ""),
      pays: cellStr(keys.pays ? raw[keys.pays] : ""),
      dateNaissanceIso: parseFinzzleClientDate(
        keys.dateNaissance ? raw[keys.dateNaissance] : undefined
      ),
      sourceLead: cellStr(keys.sourceLead ? raw[keys.sourceLead] : ""),
      tmi: normalizeImportTmi(keys.tmi ? raw[keys.tmi] : undefined) ?? "",
    });
  }
  return rows;
}

export function reassessFinzzleClientPreviewLine(
  line: FinzzleClientPreviewLine,
  contacts: Contact[],
  fileDupIndex: FinzzleClientFileDuplicateIndex,
  allLines: FinzzleClientPreviewLine[],
  duplicateAction: FinzzleDuplicateAction = "consolidate"
): FinzzleClientPreviewLine {
  if (line.status === "imported") return line;

  const nom = line.nom.trim();
  const prenom = line.prenom.trim();
  if (!nom || !prenom) {
    return {
      ...line,
      status: "invalid",
      statusMessage: "Nom et prénom obligatoires",
      contactId: undefined,
      duplicateMatch: undefined,
      identityConflict: undefined,
      conflictReasons: undefined,
      duplicateCsvRefRow: undefined,
    };
  }

  const csvRef = findCsvDuplicateRef(line, fileDupIndex, allLines);
  if (csvRef !== undefined) {
    return {
      ...line,
      nom,
      prenom,
      status: "duplicate_csv",
      statusMessage: `Doublon fichier (→ ligne ${csvRef})`,
      contactId: undefined,
      duplicateMatch: undefined,
      identityConflict: undefined,
      conflictReasons: undefined,
      duplicateCsvRefRow: csvRef,
    };
  }

  const existingMatch = findExistingContactForLine(line, contacts);
  if (!existingMatch) {
    return {
      ...line,
      nom,
      prenom,
      status: "ready",
      statusMessage: line.categorie.replace(/_/g, " "),
      contactId: undefined,
      duplicateMatch: undefined,
      identityConflict: undefined,
      conflictReasons: undefined,
      duplicateCsvRefRow: undefined,
    };
  }

  const { contact, match } = existingMatch;
  const conflictReasons = getPairIdentityConflictMessages(lineIdentity(line), contact);
  const identityConflict = conflictReasons.length > 0;

  if (identityConflict && duplicateAction !== "merge") {
    const conflictLabel =
      match === "email"
        ? "Correspondance email"
        : match === "phone"
          ? "Correspondance téléphone"
          : "Homonyme";
    return {
      ...line,
      nom,
      prenom,
      status: "duplicate_homonym",
      statusMessage: `${conflictLabel} (${conflictReasons.join(", ")}) — ${contact.prenom} ${contact.nom}`,
      contactId: contact.id,
      duplicateMatch: match,
      identityConflict: true,
      conflictReasons,
      duplicateCsvRefRow: undefined,
    };
  }

  if (duplicateAction === "merge" && identityConflict) {
    return {
      ...line,
      nom,
      prenom,
      status: "ready",
      statusMessage: "Nouvelle fiche (identité distincte)",
      contactId: undefined,
      duplicateMatch: match,
      identityConflict: true,
      conflictReasons,
      duplicateCsvRefRow: undefined,
    };
  }

  const matchLabel =
    match === "email"
      ? "Correspondance email"
      : match === "phone"
        ? "Correspondance téléphone"
        : "Enrichir";

  return {
    ...line,
    nom,
    prenom,
    status: "enrich",
    statusMessage: `${matchLabel} : ${contact.prenom} ${contact.nom}`,
    contactId: contact.id,
    duplicateMatch: match,
    identityConflict: false,
    conflictReasons: undefined,
    duplicateCsvRefRow: undefined,
  };
}

export function buildFinzzleClientsImportPreview(
  rows: FinzzleClientRow[],
  contacts: Contact[],
  duplicateAction: FinzzleDuplicateAction = "consolidate"
): FinzzleClientPreviewLine[] {
  const base: FinzzleClientPreviewLine[] = rows.map((row) => ({
    ...row,
    lineKey: buildLineKey(row),
    status: "ready" as const,
    statusMessage: "",
  }));
  const fileDupIndex = buildFinzzleClientFileDuplicateIndex(base);
  return base.map((line) =>
    reassessFinzzleClientPreviewLine(line, contacts, fileDupIndex, base, duplicateAction)
  );
}

export function reassessFinzzleClientsPreview(
  lines: FinzzleClientPreviewLine[],
  contacts: Contact[],
  duplicateAction: FinzzleDuplicateAction
): FinzzleClientPreviewLine[] {
  const fileDupIndex = buildFinzzleClientFileDuplicateIndex(lines);
  return lines.map((line) =>
    reassessFinzzleClientPreviewLine(line, contacts, fileDupIndex, lines, duplicateAction)
  );
}

export function patchFinzzleClientPreviewLines(
  lines: FinzzleClientPreviewLine[],
  patches: Map<string, Partial<FinzzleClientRow>>,
  contacts: Contact[],
  duplicateAction: FinzzleDuplicateAction = "consolidate"
): FinzzleClientPreviewLine[] {
  const merged = lines.map((line) => {
    const patch = patches.get(line.lineKey);
    if (!patch) return line;
    const next: FinzzleClientPreviewLine = { ...line, ...patch, lineKey: line.lineKey };
    if (patch.telephone !== undefined) {
      next.telephone = normalizeImportTelephone(patch.telephone);
    }
    if (patch.civilite !== undefined) {
      next.civilite = normalizeImportCivilite(patch.civilite) ?? patch.civilite;
    }
    if (patch.categorie !== undefined) {
      next.categorie = normalizeImportStatut(patch.categorie) ?? next.categorie;
    }
    if (patch.tmi !== undefined) {
      next.tmi = normalizeImportTmi(patch.tmi) ?? patch.tmi.trim();
    }
    return next;
  });
  const fileDupIndex = buildFinzzleClientFileDuplicateIndex(merged);
  return merged.map((line) =>
    reassessFinzzleClientPreviewLine(line, contacts, fileDupIndex, merged, duplicateAction)
  );
}

export function summarizeFinzzleClientsImportPreview(
  lines: FinzzleClientPreviewLine[]
): FinzzleClientImportPreviewSummary {
  const summary: FinzzleClientImportPreviewSummary = {
    total: lines.length,
    ready: 0,
    enrich: 0,
    duplicateHomonym: 0,
    invalid: 0,
    duplicateCsv: 0,
    imported: 0,
  };
  for (const line of lines) {
    switch (line.status) {
      case "ready":
        summary.ready += 1;
        break;
      case "enrich":
        summary.enrich += 1;
        break;
      case "duplicate_homonym":
        summary.duplicateHomonym += 1;
        break;
      case "invalid":
        summary.invalid += 1;
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

export function isFinzzleClientLineSelectable(
  line: FinzzleClientPreviewLine,
  _duplicateAction: FinzzleDuplicateAction
): boolean {
  return line.status === "ready" || line.status === "enrich";
}

export function defaultSelectedFinzzleClientLineKeys(
  lines: FinzzleClientPreviewLine[],
  duplicateAction: FinzzleDuplicateAction
): Set<string> {
  return new Set(
    lines
      .filter((l) => {
        if (!isFinzzleClientLineSelectable(l, duplicateAction)) return false;
        if (duplicateAction === "skip" && l.status === "enrich") return false;
        return true;
      })
      .map((l) => l.lineKey)
  );
}

function buildNewContactPayload(line: FinzzleClientPreviewLine): NewContact {
  return {
    nom: line.nom,
    prenom: line.prenom,
    civilite: line.civilite || undefined,
    email: line.email || undefined,
    telephone: line.telephone || undefined,
    adresse: line.adresse || undefined,
    code_postal: line.codePostal || undefined,
    ville: line.ville || undefined,
    pays: line.pays || undefined,
    date_naissance: line.dateNaissanceIso,
    source_lead: line.sourceLead || undefined,
    categorie: line.categorie,
    statut_suivi: "ACTIF",
  };
}

function buildEnrichPayload(
  line: FinzzleClientPreviewLine,
  existing: Contact,
  match: FinzzleDuplicateMatchKind
): Partial<NewContact> {
  const dateNaissance = resolveEnrichDateNaissance(
    existing.date_naissance,
    line.dateNaissanceIso
  );

  const shared: Partial<NewContact> = {
    civilite: line.civilite || existing.civilite,
    email: line.email || existing.email,
    telephone: line.telephone || existing.telephone,
    adresse: line.adresse || existing.adresse,
    code_postal: line.codePostal || existing.code_postal,
    ville: line.ville || existing.ville,
    pays: line.pays || existing.pays,
    source_lead: line.sourceLead || existing.source_lead,
    categorie: pickEnrichClientCategory(
      existing.categorie,
      line.categorie,
      existing.filleul_categorie
    ),
    date_naissance: dateNaissance,
    statut_suivi: existing.statut_suivi || "ACTIF",
  };

  if (match === "name") {
    return {
      ...shared,
      nom: line.nom,
      prenom: line.prenom,
    };
  }

  return {
    ...shared,
    nom: existing.nom,
    prenom: existing.prenom,
  };
}

async function applyFinzzleClientEnrichLine(
  line: FinzzleClientPreviewLine,
  contacts: Contact[]
): Promise<{ line: FinzzleClientPreviewLine; updated?: Contact }> {
  const existing = contacts.find((c) => c.id === line.contactId);
  if (!existing?.id) {
    throw new Error("Contact introuvable pour enrichissement");
  }
  const match = line.duplicateMatch ?? "name";
  const updated = await updateContact(
    existing.id,
    contactToUpdatePayload(existing, buildEnrichPayload(line, existing, match)),
    IMPORT_SAVE_OPTS
  );
  await applyImportTmi({ contactId: existing.id, foyerId: updated.foyer_id }, line.tmi);
  return {
    line: {
      ...line,
      status: "imported",
      statusMessage: "Enrichi",
      contactId: existing.id,
    },
    updated,
  };
}

async function applyFinzzleClientCreateLine(
  line: FinzzleClientPreviewLine
): Promise<{ line: FinzzleClientPreviewLine; created: Contact }> {
  const created = await createContact(buildNewContactPayload(line), IMPORT_SAVE_OPTS);
  const contactId = created.id!;
  await applyImportTmi({ contactId, foyerId: created.foyer_id }, line.tmi);
  return {
    line: {
      ...line,
      status: "imported",
      statusMessage: "Importé",
      contactId,
    },
    created,
  };
}

export async function applyFinzzleClientsImport(
  lines: FinzzleClientPreviewLine[],
  selectedLineKeys: ReadonlySet<string>,
  duplicateAction: FinzzleDuplicateAction = "consolidate"
): Promise<{ applied: number; failed: number; lines: FinzzleClientPreviewLine[] }> {
  const toImport = lines.filter(
    (l) => isFinzzleClientLineSelectable(l, duplicateAction) && selectedLineKeys.has(l.lineKey)
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
    let contactsCache = await getAllContacts();
    const outcomes: {
      lineKey: string;
      result?: FinzzleClientPreviewLine;
      error?: string;
    }[] = [];

    for (const line of toImport) {
      try {
        if (line.status === "enrich") {
          const { line: resultLine, updated } = await applyFinzzleClientEnrichLine(
            line,
            contactsCache
          );
          outcomes.push({ lineKey: line.lineKey, result: resultLine });
          if (updated) {
            contactsCache = contactsCache.map((c) => (c.id === updated.id ? updated : c));
          }
        } else {
          const { line: resultLine, created } = await applyFinzzleClientCreateLine(line);
          outcomes.push({ lineKey: line.lineKey, result: resultLine });
          contactsCache = [...contactsCache, created];
        }
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

export function isoToDateInput(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function dateInputToIso(dateInput: string): string | undefined {
  const trimmed = dateInput.trim();
  if (!trimmed) return undefined;
  return parseFinzzleClientDate(trimmed);
}

export function readFinzzleClientsWorkbookRows(
  file: File
): Promise<{ rows: Record<string, unknown>[]; isFinzzle: boolean }> {
  return file.arrayBuffer().then((data) => {
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const workbook = isCsv
      ? XLSX.read(data, { type: "array", raw: true })
      : XLSX.read(data, { type: "array", cellDates: true });
    if (workbook.SheetNames.length === 0) {
      return { rows: [] as Record<string, unknown>[], isFinzzle: false };
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    return { rows, isFinzzle: isFinzzleClientsExport(headers) };
  });
}

// Alias rétrocompat tests
export function buildFinzzleClientPreviewSeenInFileFromLines(
  lines: FinzzleClientPreviewLine[]
): Map<string, number> {
  return buildFinzzleClientFileDuplicateIndex(lines).names;
}
