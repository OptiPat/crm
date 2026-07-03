import type { Contact } from "@/lib/api/tauri-contacts";
import { getAllContacts, updateContact } from "@/lib/api/tauri-contacts";
import {
  createFoyer,
  getAllFoyers,
  type Foyer,
} from "@/lib/api/tauri-foyers";
import {
  createInvestissement,
  getAllInvestissements,
  updateInvestissement,
  type Investissement,
  type NewInvestissement,
} from "@/lib/api/tauri-investissements";
import {
  createPartenaire,
  getAllPartenaires,
  type NewPartenaire,
  type Partenaire,
} from "@/lib/api/tauri-partenaires";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";
import {
  deduireTypePartenaire,
  findMatchingPartenaire,
} from "@/lib/contacts/partenaire-match";
import { parseImportDate } from "@/lib/contacts/parse-import-date";
import { parseNomCompletInvestisseur } from "@/lib/contacts/investor-name-parse";
import {
  contactNameKeyCanonical,
  findContactByNameKeyWithSwap,
} from "@/lib/contacts/name-match";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import {
  buildFoyerNomFromMembers,
  findExistingFoyerByFamilleName,
  linkContactToFoyer,
} from "@/lib/foyers/foyer-utils";
import { parseEuroInput } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import { notifyInvestissementsChanged } from "@/lib/investissements/investissement-events";

const IMPORT_SAVE_OPTS = { skipPostSaveHooks: true } as const;

const INTERNAL_PROGRAMME_PREFIX = /^(?:picd|pickd|picking)\s+/i;

const COLUMN_ALIASES = {
  investorNomComplet: ["nom complet investisseur"],
  investorEmail: ["email investisseur"],
  coNomComplet: ["co-investisseur - nom prénom", "co-investisseur - nom prenom"],
  coEmail: ["co-investisseur - mail"],
  nomProgramme: ["nom programme"],
  villeProgramme: ["ville programme"],
  dispositif: ["dispositif fiscal"],
  dateActe: ["date acte"],
  prixTtc: ["prix ttc"],
  lot: ["^lot$"],
  etatCommande: ["etat commande", "état commande"],
  paiementComptant: ["paiment comptant", "paiement comptant"],
  partenaire: ["partenaire", "promoteur", "gestionnaire", "nom promoteur"],
} as const;

/** Types immo proposés en preview (correction Pinel / Malraux…). */
export const IMMO_IMPORT_TYPE_PRODUIT_OPTIONS = [
  { value: "PINEL", label: "Pinel" },
  { value: "MALRAUX", label: "Malraux" },
  { value: "DENORMANDIE", label: "Denormandie" },
  { value: "MONUMENT_HISTORIQUE", label: "Monument Historique" },
  { value: "DEFICIT_FONCIER", label: "Déficit Foncier" },
  { value: "JEANBRUN", label: "Jeanbrun" },
  { value: "LMNP", label: "LMNP" },
  { value: "LMP", label: "LMP" },
  { value: "NUE_PROPRIETE", label: "Nue-Propriété" },
  { value: "RESIDENCE_PRINCIPALE", label: "Résidence Principale" },
  { value: "AUTRE", label: "Autre" },
] as const;

export type ImmoCommandeRow = {
  rowIndex: number;
  investorNom: string;
  investorPrenom: string;
  investorEmail: string;
  coInvestorNom?: string;
  coInvestorPrenom?: string;
  coInvestorEmail?: string;
  typeProduit: string;
  nomProduit: string;
  montantCentimes: number;
  dateActeIso?: string;
  partenaireNom: string;
  notes?: string;
};

export function formatImmoEuroField(centimes: number): string {
  if (centimes === 0) return "0";
  return (centimes / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Montant euro saisi en preview (accepte 0). */
export function parseImmoEuroFieldCentimes(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const euros = parseEuroInput(trimmed.replace(/\s/g, ""));
  if (euros == null || euros < 0) return null;
  return Math.round(euros * 100);
}

export type ImmoImportLineStatus =
  | "ready"
  | "invalid"
  | "contact_not_found"
  | "co_contact_not_found"
  | "duplicate_crm"
  | "duplicate_csv"
  | "imported";

export type ImmoImportPreviewLine = ImmoCommandeRow & {
  lineKey: string;
  status: ImmoImportLineStatus;
  statusMessage: string;
  contactId?: number;
  coContactId?: number;
  foyerId?: number;
  partenaireId?: number;
  investissementId?: number;
  contactLabel?: string;
  coContactLabel?: string;
};

export type ImmoImportPreviewSummary = {
  total: number;
  ready: number;
  invalid: number;
  contactNotFound: number;
  coContactNotFound: number;
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

function findColumnKey(
  sampleRow: Record<string, unknown>,
  aliases: readonly string[]
): string | undefined {
  for (const key of Object.keys(sampleRow)) {
    const normalized = normalizeHeader(key);
    if (
      aliases.some((alias) => {
        if (alias.startsWith("^") && alias.endsWith("$")) {
          return normalized === alias.slice(1, -1);
        }
        return normalized === alias || normalized.includes(alias);
      })
    ) {
      return key;
    }
  }
  return undefined;
}

function cellStr(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function isEmptyCell(value: unknown): boolean {
  const s = cellStr(value);
  return !s || s === "-";
}

/** @deprecated Import from `@/lib/contacts/investor-name-parse` — réexport pour compat. */
export { parseNomCompletInvestisseur } from "@/lib/contacts/investor-name-parse";

/** Retire les préfixes internes PICD / PICKD / Picking. */
export function cleanProgrammeName(raw: string): string {
  let s = raw.trim();
  while (INTERNAL_PROGRAMME_PREFIX.test(s)) {
    s = s.replace(INTERNAL_PROGRAMME_PREFIX, "").trim();
  }
  return s.replace(/\s+/g, " ").trim();
}

export function buildImmoNomProduit(programme: string, ville: string): string {
  const name = cleanProgrammeName(programme);
  if (!name) return ville.trim();
  const v = ville.trim();
  return v ? `${name} — ${v}` : name;
}

/** Dispositif fiscal Excel → `type_produit` CRM (Pinel, Malraux…). Pas le nom du programme. */
export function mapDispositifFiscalToTypeProduit(dispositif: string): string | null {
  const k = dispositif
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!k || k === "-") return null;
  if (k.includes("pinel")) return "PINEL";
  if (k.includes("denormandie")) return "DENORMANDIE";
  if (k.includes("malraux")) return "MALRAUX";
  if (k.includes("monument")) return "MONUMENT_HISTORIQUE";
  if (k.includes("deficit")) return "DEFICIT_FONCIER";
  if (k.includes("jeanbrun")) return "JEANBRUN";
  if (k.includes("lmnp")) return "LMNP";
  if (k.includes("lmp")) return "LMP";
  if (k.includes("nue") && k.includes("propriet")) return "NUE_PROPRIETE";
  if (k.includes("residence") && k.includes("principale")) return "RESIDENCE_PRINCIPALE";
  /** Dispositif non listé dans le CRM (ex. Besson) — type AUTRE + libellé en notes. */
  return "AUTRE";
}

export function parseImmoPrixTtcCentimes(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null;
    return Math.round(value * 100);
  }
  const euros = parseEuroInput(String(value));
  if (euros == null || euros <= 0) return null;
  return Math.round(euros * 100);
}

function buildNotes(parts: string[]): string | undefined {
  const joined = parts.filter(Boolean).join(" | ");
  return joined || undefined;
}

function resolveColumnKeys(
  sampleRow: Record<string, unknown>
): Record<keyof typeof COLUMN_ALIASES, string | undefined> {
  return {
    investorNomComplet: findColumnKey(sampleRow, COLUMN_ALIASES.investorNomComplet),
    investorEmail: findColumnKey(sampleRow, COLUMN_ALIASES.investorEmail),
    coNomComplet: findColumnKey(sampleRow, COLUMN_ALIASES.coNomComplet),
    coEmail: findColumnKey(sampleRow, COLUMN_ALIASES.coEmail),
    nomProgramme: findColumnKey(sampleRow, COLUMN_ALIASES.nomProgramme),
    villeProgramme: findColumnKey(sampleRow, COLUMN_ALIASES.villeProgramme),
    dispositif: findColumnKey(sampleRow, COLUMN_ALIASES.dispositif),
    dateActe: findColumnKey(sampleRow, COLUMN_ALIASES.dateActe),
    prixTtc: findColumnKey(sampleRow, COLUMN_ALIASES.prixTtc),
    lot: findColumnKey(sampleRow, COLUMN_ALIASES.lot),
    etatCommande: findColumnKey(sampleRow, COLUMN_ALIASES.etatCommande),
    paiementComptant: findColumnKey(sampleRow, COLUMN_ALIASES.paiementComptant),
    partenaire: findColumnKey(sampleRow, COLUMN_ALIASES.partenaire),
  };
}

export function parseImmoCommandeRows(
  rawRows: Record<string, unknown>[]
): ImmoCommandeRow[] {
  if (rawRows.length === 0) return [];
  const keys = resolveColumnKeys(rawRows[0]!);
  const rows: ImmoCommandeRow[] = [];

  rawRows.forEach((raw, index) => {
    const rowIndex = index + 2;
    const investorFull = keys.investorNomComplet
      ? cellStr(raw[keys.investorNomComplet])
      : "";
    const investor = parseNomCompletInvestisseur(investorFull);
    if (!investor) return;

    const dispositif = keys.dispositif ? cellStr(raw[keys.dispositif]) : "";
    const typeProduit = mapDispositifFiscalToTypeProduit(dispositif);
    if (!typeProduit) return;

    const programme = keys.nomProgramme ? cellStr(raw[keys.nomProgramme]) : "";
    const ville = keys.villeProgramme ? cellStr(raw[keys.villeProgramme]) : "";
    const nomProduit = buildImmoNomProduit(programme, ville);
    if (!nomProduit) return;

    const prixKey = keys.prixTtc;
    const montantCentimes = prixKey ? parseImmoPrixTtcCentimes(raw[prixKey]) : null;
    if (montantCentimes == null) return;

    const dateActeRaw = keys.dateActe ? raw[keys.dateActe] : undefined;
    const dateActeIso = parseImportDate(dateActeRaw);

    const coFull = keys.coNomComplet ? cellStr(raw[keys.coNomComplet]) : "";
    const coParsed = !isEmptyCell(coFull)
      ? parseNomCompletInvestisseur(coFull)
      : null;

    const noteParts: string[] = [];
    if (typeProduit === "AUTRE" && dispositif.trim()) {
      noteParts.push(`Dispositif fiscal: ${dispositif.trim()}`);
    }
    const lot = keys.lot ? cellStr(raw[keys.lot]) : "";
    if (lot) noteParts.push(`Lot: ${lot}`);
    const etat = keys.etatCommande ? cellStr(raw[keys.etatCommande]) : "";
    if (etat) noteParts.push(`État: ${etat}`);
    const comptant = keys.paiementComptant ? cellStr(raw[keys.paiementComptant]) : "";
    if (comptant) noteParts.push(`Comptant: ${comptant}`);

    rows.push({
      rowIndex,
      investorNom: investor.nom,
      investorPrenom: investor.prenom,
      investorEmail: keys.investorEmail ? cellStr(raw[keys.investorEmail]) : "",
      coInvestorNom: coParsed?.nom,
      coInvestorPrenom: coParsed?.prenom,
      coInvestorEmail: keys.coEmail ? cellStr(raw[keys.coEmail]) : undefined,
      typeProduit,
      nomProduit,
      montantCentimes,
      dateActeIso,
      partenaireNom: keys.partenaire ? cellStr(raw[keys.partenaire]) : "",
      notes: buildNotes(noteParts),
    });
  });

  return rows;
}

export function resolveContactForImmoImport(
  contacts: Contact[],
  nom: string,
  prenom: string,
  email?: string
): Contact | undefined {
  const byName = findContactByNameKeyWithSwap(contacts, nom, prenom);
  if (byName) return byName;
  const em = email?.trim().toLowerCase();
  if (!em || em === "-") return undefined;
  return contacts.find((c) => c.email?.trim().toLowerCase() === em);
}

function findExistingImmoInvestissementForPreview(
  investissements: Investissement[],
  contact: Contact,
  coContact: Contact | undefined,
  row: ImmoCommandeRow
): Investissement | undefined {
  if (coContact) {
    const sharedFoyer =
      contact.foyer_id && contact.foyer_id === coContact.foyer_id
        ? contact.foyer_id
        : undefined;
    if (sharedFoyer) {
      return findExistingImmoInvestissement(investissements, {
        foyerId: sharedFoyer,
        typeProduit: row.typeProduit,
        nomProduit: row.nomProduit,
        montantCentimes: row.montantCentimes,
      });
    }
    return undefined;
  }
  return findExistingImmoInvestissement(investissements, {
    contactId: contact.id,
    typeProduit: row.typeProduit,
    nomProduit: row.nomProduit,
    montantCentimes: row.montantCentimes,
  });
}

export function findExistingImmoInvestissement(
  investissements: Investissement[],
  opts: {
    contactId?: number;
    foyerId?: number;
    typeProduit: string;
    nomProduit: string;
    montantCentimes?: number;
  }
): Investissement | undefined {
  return investissements.find((inv) => {
    const sameOwner =
      (opts.contactId != null && inv.contact_id === opts.contactId) ||
      (opts.foyerId != null && inv.foyer_id === opts.foyerId);
    if (!sameOwner) return false;
    if (inv.type_produit !== opts.typeProduit) return false;
    if (inv.nom_produit.toUpperCase().trim() !== opts.nomProduit.toUpperCase().trim()) {
      return false;
    }
    if (opts.montantCentimes != null && inv.montant_initial != null) {
      if (Math.abs(inv.montant_initial - opts.montantCentimes) > 100) return false;
    }
    return true;
  });
}

function investorLineKey(row: ImmoCommandeRow): string {
  return contactNameKeyCanonical(row.investorNom, row.investorPrenom);
}

function businessLineKey(row: ImmoCommandeRow): string {
  const coKey =
    row.coInvestorNom && row.coInvestorPrenom
      ? contactNameKeyCanonical(row.coInvestorNom, row.coInvestorPrenom)
      : "";
  return `${investorLineKey(row)}|${coKey}|${row.typeProduit}|${row.nomProduit.toUpperCase()}|${row.montantCentimes}`;
}

function assessImmoImportLine(
  row: ImmoCommandeRow,
  lineKey: string,
  ctx: {
    contact: Contact | undefined;
    coContact: Contact | undefined;
    contactLabel: string;
    coContactLabel: string | undefined;
    foyerId: number | undefined;
    duplicateCsvRowIndex: number | undefined;
    existing: Investissement | undefined;
  }
): ImmoImportPreviewLine {
  const { contact, coContact, contactLabel, coContactLabel, foyerId, duplicateCsvRowIndex, existing } =
    ctx;
  const hasCo = !!(row.coInvestorNom && row.coInvestorPrenom);

  if (!row.dateActeIso) {
    return {
      ...row,
      lineKey,
      status: "invalid",
      statusMessage: "Date Acte manquante ou illisible",
      contactId: contact?.id,
      coContactId: coContact?.id,
      contactLabel,
      coContactLabel,
    };
  }

  if (row.montantCentimes <= 0) {
    return {
      ...row,
      lineKey,
      status: "invalid",
      statusMessage: "Montant invalide",
      contactId: contact?.id,
      coContactId: coContact?.id,
      contactLabel,
      coContactLabel,
    };
  }

  if (!contact) {
    return {
      ...row,
      lineKey,
      status: "contact_not_found",
      statusMessage: `Investisseur introuvable (${row.investorPrenom} ${row.investorNom})`,
      contactLabel,
      coContactLabel,
    };
  }

  if (hasCo && !coContact) {
    return {
      ...row,
      lineKey,
      status: "co_contact_not_found",
      statusMessage: `Co-investisseur introuvable (${row.coInvestorPrenom} ${row.coInvestorNom})`,
      contactId: contact.id,
      contactLabel,
      coContactLabel,
    };
  }

  if (duplicateCsvRowIndex != null) {
    return {
      ...row,
      lineKey,
      status: "duplicate_csv",
      statusMessage: `Doublon dans le fichier (ligne ${duplicateCsvRowIndex})`,
      contactId: contact.id,
      coContactId: coContact?.id,
      foyerId,
      contactLabel,
      coContactLabel,
    };
  }

  if (existing) {
    return {
      ...row,
      lineKey,
      status: "duplicate_crm",
      statusMessage: "Investissement déjà en base",
      contactId: contact.id,
      coContactId: coContact?.id,
      foyerId: foyerId ?? contact.foyer_id ?? undefined,
      investissementId: existing.id,
      contactLabel,
      coContactLabel,
    };
  }

  return {
    ...row,
    lineKey,
    status: "ready",
    statusMessage: hasCo
      ? `Prêt — foyer (${contactLabel} + ${coContactLabel})`
      : `Prêt — ${contactLabel}`,
    contactId: contact.id,
    coContactId: coContact?.id,
    foyerId,
    contactLabel,
    coContactLabel,
  };
}

export function reassessImmoPreviewLine(
  line: ImmoImportPreviewLine,
  contacts: Contact[],
  investissements: Investissement[],
  seenInFile: ReadonlyMap<string, number>
): ImmoImportPreviewLine {
  if (line.status === "imported") return line;

  const contact = line.contactId
    ? contacts.find((c) => c.id === line.contactId)
    : resolveContactForImmoImport(
        contacts,
        line.investorNom,
        line.investorPrenom,
        line.investorEmail
      );

  const hasCo = !!(line.coInvestorNom && line.coInvestorPrenom);
  const coContact = line.coContactId
    ? contacts.find((c) => c.id === line.coContactId)
    : hasCo
      ? resolveContactForImmoImport(
          contacts,
          line.coInvestorNom!,
          line.coInvestorPrenom!,
          line.coInvestorEmail
        )
      : undefined;

  const contactLabel = contact
    ? `${contact.prenom} ${contact.nom}`
    : `${line.investorPrenom} ${line.investorNom}`;
  const coContactLabel =
    hasCo && coContact
      ? `${coContact.prenom} ${coContact.nom}`
      : hasCo
        ? `${line.coInvestorPrenom} ${line.coInvestorNom}`
        : undefined;

  let foyerId: number | undefined;
  if (contact && coContact?.foyer_id && contact.foyer_id === coContact.foyer_id) {
    foyerId = contact.foyer_id;
  }

  const bizKey = businessLineKey(line);
  const firstRow = seenInFile.get(bizKey);
  const duplicateCsvRowIndex =
    firstRow != null && firstRow !== line.rowIndex ? firstRow : undefined;

  const existing =
    contact && (duplicateCsvRowIndex == null)
      ? findExistingImmoInvestissementForPreview(investissements, contact, coContact, line)
      : undefined;

  return assessImmoImportLine(line, line.lineKey, {
    contact,
    coContact,
    contactLabel,
    coContactLabel,
    foyerId,
    duplicateCsvRowIndex,
    existing,
  });
}

export function patchImmoPreviewLine(
  line: ImmoImportPreviewLine,
  patch: Partial<
    Pick<
      ImmoImportPreviewLine,
      | "typeProduit"
      | "nomProduit"
      | "montantCentimes"
      | "dateActeIso"
      | "partenaireNom"
      | "notes"
    >
  >,
  contacts: Contact[],
  investissements: Investissement[]
): ImmoImportPreviewLine {
  const [next] = patchImmoPreviewLines([line], line.lineKey, patch, contacts, investissements);
  return next ?? line;
}

function mergeImmoPreviewPatch(
  line: ImmoImportPreviewLine,
  patch: Partial<
    Pick<
      ImmoImportPreviewLine,
      | "typeProduit"
      | "nomProduit"
      | "montantCentimes"
      | "dateActeIso"
      | "partenaireNom"
      | "notes"
    >
  >
): ImmoImportPreviewLine {
  return {
    ...line,
    ...patch,
    montantCentimes:
      patch.montantCentimes != null
        ? Math.max(0, patch.montantCentimes)
        : line.montantCentimes,
    partenaireNom:
      patch.partenaireNom != null ? patch.partenaireNom.trim() : line.partenaireNom,
    nomProduit:
      patch.nomProduit != null ? patch.nomProduit.trim() : line.nomProduit,
  };
}

/** Recalcule seenInFile depuis l'état preview courant (ignore les lignes déjà importées). */
export function buildImmoPreviewSeenInFileFromLines(
  lines: readonly ImmoImportPreviewLine[]
): Map<string, number> {
  const seen = new Map<string, number>();
  const sorted = [...lines]
    .filter((l) => l.status !== "imported")
    .sort((a, b) => a.rowIndex - b.rowIndex);
  for (const line of sorted) {
    const key = businessLineKey(line);
    if (!seen.has(key)) seen.set(key, line.rowIndex);
  }
  return seen;
}

/** Applique un patch et réévalue toutes les lignes (doublons fichier inclus). */
export function patchImmoPreviewLines(
  lines: ImmoImportPreviewLine[],
  lineKey: string,
  patch: Partial<
    Pick<
      ImmoImportPreviewLine,
      | "typeProduit"
      | "nomProduit"
      | "montantCentimes"
      | "dateActeIso"
      | "partenaireNom"
      | "notes"
    >
  >,
  contacts: Contact[],
  investissements: Investissement[]
): ImmoImportPreviewLine[] {
  const withPatch = lines.map((line) =>
    line.lineKey === lineKey ? mergeImmoPreviewPatch(line, patch) : line
  );
  const seenInFile = buildImmoPreviewSeenInFileFromLines(withPatch);
  return withPatch.map((line) =>
    line.status === "imported"
      ? line
      : reassessImmoPreviewLine(line, contacts, investissements, seenInFile)
  );
}

export function buildImmoPreviewSeenInFile(rows: ImmoCommandeRow[]): Map<string, number> {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = businessLineKey(row);
    if (!seen.has(key)) seen.set(key, row.rowIndex);
  }
  return seen;
}

export function buildImmoCommandesImportPreview(
  rows: ImmoCommandeRow[],
  contacts: Contact[],
  investissements: Investissement[]
): ImmoImportPreviewLine[] {
  const seenInFile = new Map<string, number>();

  return rows.map((row) => {
    const lineKey = `row-${row.rowIndex}`;
    const contact = resolveContactForImmoImport(
      contacts,
      row.investorNom,
      row.investorPrenom,
      row.investorEmail
    );

    const hasCo = !!(row.coInvestorNom && row.coInvestorPrenom);
    let coContact: Contact | undefined;
    if (hasCo) {
      coContact = resolveContactForImmoImport(
        contacts,
        row.coInvestorNom!,
        row.coInvestorPrenom!,
        row.coInvestorEmail
      );
    }

    const contactLabel = contact
      ? `${contact.prenom} ${contact.nom}`
      : `${row.investorPrenom} ${row.investorNom}`;
    const coContactLabel =
      hasCo && coContact
        ? `${coContact.prenom} ${coContact.nom}`
        : hasCo
          ? `${row.coInvestorPrenom} ${row.coInvestorNom}`
          : undefined;

    let foyerId: number | undefined;
    if (contact && coContact) {
      if (contact.foyer_id && contact.foyer_id === coContact.foyer_id) {
        foyerId = contact.foyer_id;
      }
    }

    const bizKey = businessLineKey(row);
    const duplicateCsvRowIndex = seenInFile.has(bizKey)
      ? seenInFile.get(bizKey)
      : undefined;
    if (!duplicateCsvRowIndex) seenInFile.set(bizKey, row.rowIndex);

    const existing =
      contact && duplicateCsvRowIndex == null
        ? findExistingImmoInvestissementForPreview(investissements, contact, coContact, row)
        : undefined;

    return assessImmoImportLine(row, lineKey, {
      contact,
      coContact,
      contactLabel,
      coContactLabel,
      foyerId,
      duplicateCsvRowIndex,
      existing,
    });
  });
}

export function summarizeImmoImportPreview(
  lines: ImmoImportPreviewLine[]
): ImmoImportPreviewSummary {
  const count = (status: ImmoImportLineStatus) =>
    lines.filter((l) => l.status === status).length;
  return {
    total: lines.length,
    ready: count("ready"),
    invalid: count("invalid"),
    contactNotFound: count("contact_not_found"),
    coContactNotFound: count("co_contact_not_found"),
    duplicateCrm: count("duplicate_crm"),
    duplicateCsv: count("duplicate_csv"),
    imported: count("imported"),
  };
}

async function ensureFoyerForCoInvestors(
  contact1: Contact,
  contact2: Contact,
  foyersCache: Foyer[]
): Promise<number> {
  if (contact1.foyer_id && contact1.foyer_id === contact2.foyer_id) {
    return contact1.foyer_id;
  }

  const compositeNom = buildFoyerNomFromMembers([contact1, contact2])
    .replace(/^Foyer\s+/i, "")
    .trim();

  let foyer = findExistingFoyerByFamilleName(foyersCache, compositeNom);

  if (!foyer) {
    foyer = await createFoyer({
      nom: buildFoyerNomFromMembers([contact1, contact2]),
      type_foyer: "COUPLE",
    });
    foyersCache.push(foyer);
  }

  if (contact1.foyer_id !== foyer.id) {
    await linkContactToFoyer(contact1, foyer.id, "DECLARANT_1", IMPORT_SAVE_OPTS);
    contact1.foyer_id = foyer.id;
  }
  if (contact2.foyer_id !== foyer.id) {
    await linkContactToFoyer(contact2, foyer.id, "DECLARANT_2", IMPORT_SAVE_OPTS);
    contact2.foyer_id = foyer.id;
  }

  return foyer.id;
}

async function promoteContactToClient(contact: Contact): Promise<void> {
  if (contact.categorie === "CLIENT" || !contact.id) return;
  await updateContact(
    contact.id,
    contactToUpdatePayload(contact, { categorie: "CLIENT" }),
    IMPORT_SAVE_OPTS
  );
}

export type ApplyImmoImportResult =
  | { ok: true; line: ImmoImportPreviewLine; investissementId: number }
  | { ok: false; reason: "invalid" | "error" };

async function resolvePartenaireId(
  partenaireNom: string,
  typeProduit: string,
  cache: Partenaire[]
): Promise<number | undefined> {
  if (!partenaireNom.trim()) return undefined;
  let partenaire = findMatchingPartenaire(partenaireNom, cache);
  if (!partenaire) {
    const created = await createPartenaire({
      type_partenaire: deduireTypePartenaire(typeProduit),
      raison_sociale: partenaireNom.trim(),
    } satisfies NewPartenaire);
    cache.push(created);
    partenaire = created;
  }
  return partenaire.id;
}

export async function applyImmoCommandeImportLine(
  line: ImmoImportPreviewLine,
  ctx?: {
    contactsCache?: Contact[];
    foyersCache?: Foyer[];
    investissementsCache?: Investissement[];
    partenairesCache?: Partenaire[];
  }
): Promise<ApplyImmoImportResult> {
  if (line.status !== "ready" || !line.contactId || !line.dateActeIso) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const contacts = ctx?.contactsCache ?? (await getAllContacts());
    const foyers = ctx?.foyersCache ?? (await getAllFoyers());
    const investissements = ctx?.investissementsCache ?? (await getAllInvestissements());
    const partenaires = ctx?.partenairesCache ?? (await getAllPartenaires());

    const contact = contacts.find((c) => c.id === line.contactId);
    if (!contact) return { ok: false, reason: "error" };

    let foyerId: number | undefined;
    let contactId: number | undefined;

    if (line.coContactId) {
      const coContact = contacts.find((c) => c.id === line.coContactId);
      if (!coContact) return { ok: false, reason: "error" };
      foyerId = await ensureFoyerForCoInvestors(contact, coContact, foyers);
      await promoteContactToClient(contact);
      await promoteContactToClient(coContact);
    } else {
      contactId = contact.id;
      await promoteContactToClient(contact);
    }

    const partenaireId = await resolvePartenaireId(
      line.partenaireNom,
      line.typeProduit,
      partenaires
    );

    const payload: NewInvestissement = {
      contact_id: contactId,
      foyer_id: foyerId,
      type_produit: line.typeProduit,
      partenaire_id: partenaireId,
      nom_produit: line.nomProduit,
      montant_initial: line.montantCentimes,
      date_souscription: line.dateActeIso,
      notes: line.notes,
      origine: "MON_CONSEIL",
      reinvestissement_dividendes: false,
      versement_programme: false,
    };

    const existing = findExistingImmoInvestissement(investissements, {
      contactId,
      foyerId,
      typeProduit: line.typeProduit,
      nomProduit: line.nomProduit,
      montantCentimes: line.montantCentimes,
    });

    let saved;
    if (existing) {
      saved = await updateInvestissement(existing.id, payload, IMPORT_SAVE_OPTS);
      const idx = investissements.findIndex((i) => i.id === existing.id);
      if (idx !== -1) investissements[idx] = saved;
    } else {
      saved = await createInvestissement(payload, IMPORT_SAVE_OPTS);
      investissements.push(saved);
    }

    return {
      ok: true,
      investissementId: saved.id,
      line: {
        ...line,
        status: "imported",
        statusMessage: existing ? "Investissement mis à jour" : "Investissement créé",
        investissementId: saved.id,
        foyerId,
        partenaireId,
      },
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function applyImmoCommandesImport(
  lines: ImmoImportPreviewLine[],
  selectedLineKeys: ReadonlySet<string>
): Promise<{ applied: number; failed: number; lines: ImmoImportPreviewLine[] }> {
  const contactsCache = await getAllContacts();
  const foyersCache = await getAllFoyers();
  const investissementsCache = await getAllInvestissements();
  const partenairesCache = await getAllPartenaires();
  let applied = 0;
  let failed = 0;
  const updated = [...lines];

  for (let i = 0; i < updated.length; i++) {
    const line = updated[i]!;
    if (line.status !== "ready" || !selectedLineKeys.has(line.lineKey)) continue;
    const result = await applyImmoCommandeImportLine(line, {
      contactsCache,
      foyersCache,
      investissementsCache,
      partenairesCache,
    });
    if (result.ok) {
      updated[i] = result.line;
      applied += 1;
    } else {
      failed += 1;
    }
  }

  if (applied > 0) {
    notifyInvestissementsChanged();
    notifyContactsChanged();
  }
  return { applied, failed, lines: updated };
}

/** Nom de feuille attendu ou première feuille du classeur. */
export const IMMO_COMMANDES_SHEET_NAME = "Investissement Immobilier";

export function pickImmoCommandesSheetName(sheetNames: string[]): string | undefined {
  if (sheetNames.length === 0) return undefined;
  const exact = sheetNames.find(
    (n) => normalizeHeader(n) === normalizeHeader(IMMO_COMMANDES_SHEET_NAME)
  );
  return exact ?? sheetNames[0];
}
