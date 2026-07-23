import type { ClientSubTab, FilleulSubTab } from "@/lib/contacts/contacts-category-match";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { resolveFilleulInscriptionTimestamp } from "@/lib/organisation/organisation-filleul-dossier";
import type { ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";
import type { Foyer } from "@/lib/api/tauri-foyers";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import {
  getClientLabel,
  getFilleulLabel,
} from "@/lib/contacts/contact-form-utils";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { rowsToCsv } from "@/lib/export/csv-export";
import { hasActiveVersementProgramme } from "@/lib/investissements/investissement-versements";
import {
  getFilleulQualificationLabel,
  getFilleulTitreLabel,
} from "@/lib/organisation/filleul-ranks";

/** Colonne de champ personnalisé à ajouter à l'export (libellé + valeurs déjà formatées). */
export interface CustomFieldColumn {
  key: string;
  label: string;
  /** Valeur formatée par contact (clé = id contact). */
  valuesByContact: Record<number, string>;
}

export const CLIENTS_CONTACT_ONLY_CSV_HEADERS = [
  "Prénom",
  "Nom",
  "Email",
  "Téléphone",
  "Adresse",
  "Ville",
  "Code postale",
  "Catégorie",
  "Foyer",
] as const;

export const EXPORT_DATE_DERNIER_CONTACT_HEADER = "Date du dernier contact";
export const EXPORT_DATE_PREMIER_R1_HEADER = "Date du premier R1";

export const FILLEULS_CONTACTS_CSV_HEADERS = [
  ...CLIENTS_CONTACT_ONLY_CSV_HEADERS,
  "Nom du parrain",
  "Date d'inscription",
  "Titre",
  "Qualification",
  EXPORT_DATE_DERNIER_CONTACT_HEADER,
] as const;

const CLIENTS_PATRIMOINE_CSV_HEADERS = [
  "Date de souscription",
  "Type de produit",
  "Partenaire",
  "Nom du Produit",
  "Montant initial",
  "Montant des VP",
  "Fréquence",
  "Réinvestissement dividendes",
] as const;

const PATRIMOINE_HEADERS_ANCIEN = [
  "Date de souscription",
  "Date de clôture",
  ...CLIENTS_PATRIMOINE_CSV_HEADERS.slice(1),
] as const;

export function clientExportIncludesPremierR1(subTab: ClientSubTab): boolean {
  return subTab === "CLIENT" || subTab === "PROSPECT_CLIENT";
}

function premierR1Header(subTab: ClientSubTab): string[] {
  return clientExportIncludesPremierR1(subTab) ? [EXPORT_DATE_PREMIER_R1_HEADER] : [];
}

function premierR1Cell(contact: Contact, subTab: ClientSubTab): string[] {
  return clientExportIncludesPremierR1(subTab)
    ? [formatContactExportDate(contact.date_r1)]
    : [];
}

function dernierContactCell(contact: Contact, filleulDernierContact: boolean): string[] {
  const ts = filleulDernierContact
    ? contact.date_dernier_contact_filleul
    : contact.date_dernier_contact;
  return [formatContactExportDate(ts)];
}

function clientContactRowPrefix(
  contact: Contact,
  foyerById: Map<number, string>,
  clientSubTab: ClientSubTab
): string[] {
  return [
    ...contactBaseCells(contact, foyerById),
    ...premierR1Cell(contact, clientSubTab),
  ];
}

function filleulContactRowPrefix(
  contact: Contact,
  foyerById: Map<number, string>
): string[] {
  return contactBaseCells(contact, foyerById);
}

export function buildClientsExportHeaders(subTab: ClientSubTab): readonly string[] {
  const headers: string[] = [
    ...CLIENTS_CONTACT_ONLY_CSV_HEADERS,
    ...premierR1Header(subTab),
  ];
  if (clientExportIncludesPatrimoine(subTab)) {
    const patrimoine =
      subTab === "CLIENT_ANCIEN" ? PATRIMOINE_HEADERS_ANCIEN : CLIENTS_PATRIMOINE_CSV_HEADERS;
    headers.push(...patrimoine);
  }
  headers.push(EXPORT_DATE_DERNIER_CONTACT_HEADER);
  return headers;
}

export function buildFilleulsExportHeaders(subTab: FilleulSubTab): readonly string[] {
  const headers: string[] = [...CLIENTS_CONTACT_ONLY_CSV_HEADERS];
  if (filleulExportIncludesParrainage(subTab)) {
    headers.push(
      "Nom du parrain",
      "Date d'inscription",
      "Titre",
      "Qualification"
    );
  }
  headers.push(EXPORT_DATE_DERNIER_CONTACT_HEADER);
  return headers;
}

export const CLIENTS_CONTACTS_CSV_HEADERS = buildClientsExportHeaders("CLIENT");

export const ANCIENS_CLIENTS_CONTACTS_CSV_HEADERS = buildClientsExportHeaders("CLIENT_ANCIEN");

/** Prospects / suspects : pas de colonnes souscription ni patrimoine. */
export function clientExportIncludesPatrimoine(subTab: ClientSubTab): boolean {
  return subTab === "CLIENT" || subTab === "CLIENT_ANCIEN";
}

function patrimoineColumnCount(subTab: ClientSubTab): number {
  if (!clientExportIncludesPatrimoine(subTab)) return 0;
  return subTab === "CLIENT_ANCIEN"
    ? PATRIMOINE_HEADERS_ANCIEN.length
    : CLIENTS_PATRIMOINE_CSV_HEADERS.length;
}

function emptyPatrimoineCells(subTab: ClientSubTab): string[] {
  return Array.from({ length: patrimoineColumnCount(subTab) }, () => "");
}

const CLIENT_EXPORT_FILENAME_SLUG: Record<ClientSubTab, string> = {
  CLIENT: "clients",
  PROSPECT_CLIENT: "prospects",
  SUSPECT_CLIENT: "suspects",
  CLIENT_ANCIEN: "anciens_clients",
};

const FILLEUL_EXPORT_FILENAME_SLUG: Record<FilleulSubTab, string> = {
  FILLEUL: "filleuls",
  PROSPECT_FILLEUL: "prospects_filleuls",
  SUSPECT_FILLEUL: "suspects_filleuls",
  FILLEUL_DESINSCRIT: "filleuls_desinscrits",
};

/** Nom de fichier CSV selon l'onglet Contacts actif (ex. `clients_2026-07-20.csv`). */
export function buildContactsExportFilename(
  mainTab: "clients" | "filleuls",
  subTab: ClientSubTab | FilleulSubTab,
  date = new Date().toISOString().slice(0, 10)
): string {
  const slug =
    mainTab === "clients"
      ? CLIENT_EXPORT_FILENAME_SLUG[subTab as ClientSubTab]
      : FILLEUL_EXPORT_FILENAME_SLUG[subTab as FilleulSubTab];
  return `${slug}_${date}.csv`;
}

function euroFromCentimes(centimes?: number | null): string {
  if (centimes == null) return "";
  return (centimes / 100).toFixed(2);
}

function formatContactExportDate(ts?: number | null): string {
  return ts ? formatCalendarDateFr(ts) : "";
}

function contactCategorieLabel(contact: Contact): string {
  return (
    [getClientLabel(contact.categorie, contact.statut_suivi), getFilleulLabel(contact.filleul_categorie)]
      .filter(Boolean)
      .join(" · ") || contact.categorie
  );
}

function contactBaseCells(
  contact: Contact,
  foyerById: Map<number, string>
): string[] {
  return [
    contact.prenom,
    contact.nom,
    contact.email ?? "",
    contact.telephone ?? "",
    contact.adresse ?? "",
    contact.ville ?? "",
    contact.code_postal ?? "",
    contactCategorieLabel(contact),
    contact.foyer_id != null
      ? foyerById.get(contact.foyer_id) ?? String(contact.foyer_id)
      : "",
  ];
}

export function investissementAvecMoiDetailCells(
  inv: Pick<
    InvestissementWithDetails,
    | "date_souscription"
    | "date_cloture"
    | "type_produit"
    | "partenaire_nom"
    | "nom_produit"
    | "montant_initial"
    | "versement_programme"
    | "montant_versement_programme"
    | "frequence_versement"
    | "reinvestissement_dividendes"
  >,
  clientSubTab: ClientSubTab = "CLIENT"
): string[] {
  const hasVp = hasActiveVersementProgramme(inv);
  return [
    inv.date_souscription ? formatCalendarDateFr(inv.date_souscription) : "",
    ...(clientSubTab === "CLIENT_ANCIEN"
      ? [inv.date_cloture ? formatCalendarDateFr(inv.date_cloture) : ""]
      : []),
    inv.type_produit,
    inv.partenaire_nom ?? "",
    inv.nom_produit,
    euroFromCentimes(inv.montant_initial),
    hasVp ? euroFromCentimes(inv.montant_versement_programme) : "",
    hasVp ? inv.frequence_versement ?? "" : "",
    inv.reinvestissement_dividendes ? "Oui" : "Non",
  ];
}

/** Indexe les investissements « avec moi » par contact (perso + commun du foyer). */
export function indexAvecMoiInvestissementsByContact(
  investissements: InvestissementWithDetails[],
  contacts: Contact[]
): Map<number, InvestissementWithDetails[]> {
  const contactIds = new Set(
    contacts.map((c) => c.id).filter((id): id is number => id != null)
  );

  const byContactId = new Map<number, InvestissementWithDetails[]>();
  const byFoyerId = new Map<number, InvestissementWithDetails[]>();

  for (const inv of investissements) {
    if (inv.origine !== "MON_CONSEIL") continue;
    if (inv.contact_id != null) {
      if (!contactIds.has(inv.contact_id)) continue;
      const list = byContactId.get(inv.contact_id) ?? [];
      list.push(inv);
      byContactId.set(inv.contact_id, list);
      continue;
    }
    if (inv.foyer_id != null && inv.contact_id == null) {
      const list = byFoyerId.get(inv.foyer_id) ?? [];
      list.push(inv);
      byFoyerId.set(inv.foyer_id, list);
    }
  }

  const map = new Map<number, InvestissementWithDetails[]>();
  for (const contact of contacts) {
    if (contact.id == null) continue;
    const personal = byContactId.get(contact.id) ?? [];
    const commun =
      contact.foyer_id != null ? byFoyerId.get(contact.foyer_id) ?? [] : [];
    const merged = [...personal, ...commun];
    sortAvecMoiInvestissements(merged);
    map.set(contact.id, merged);
  }
  return map;
}

function sortAvecMoiInvestissements(list: InvestissementWithDetails[]): void {
  list.sort((a, b) => {
    const da = a.date_souscription ?? 0;
    const db = b.date_souscription ?? 0;
    if (da !== db) return da - db;
    return a.id - b.id;
  });
}

/** Export clients : patrimoine détaillé pour clients / anciens clients ; contact seul pour prospects / suspects. */
export function buildClientsContactsCsv(
  contacts: Contact[],
  foyers: Foyer[],
  clientSubTab: ClientSubTab,
  investissementsAvecMoi: InvestissementWithDetails[] = []
): string {
  const foyerById = new Map(foyers.map((f) => [f.id, f.nom]));
  const headers = buildClientsExportHeaders(clientSubTab);

  if (!clientExportIncludesPatrimoine(clientSubTab)) {
    const rows = contacts
      .filter((contact) => contact.id != null)
      .map((contact) => [
        ...clientContactRowPrefix(contact, foyerById, clientSubTab),
        ...dernierContactCell(contact, false),
      ]);
    return rowsToCsv([...headers], rows);
  }

  const invByContact = indexAvecMoiInvestissementsByContact(
    investissementsAvecMoi,
    contacts
  );

  const emptyPatrimoine = emptyPatrimoineCells(clientSubTab);

  const rows: string[][] = [];
  for (const contact of contacts) {
    if (contact.id == null) continue;
    const prefix = clientContactRowPrefix(contact, foyerById, clientSubTab);
    const invs = invByContact.get(contact.id) ?? [];
    const suffix = dernierContactCell(contact, false);
    if (invs.length === 0) {
      rows.push([...prefix, ...emptyPatrimoine, ...suffix]);
      continue;
    }
    for (const inv of invs) {
      rows.push([
        ...prefix,
        ...investissementAvecMoiDetailCells(inv, clientSubTab),
        ...suffix,
      ]);
    }
  }

  return rowsToCsv([...headers], rows);
}

function indexContactsById(contacts: Contact[]): Map<number, Contact> {
  const map = new Map<number, Contact>();
  for (const contact of contacts) {
    if (contact.id != null) map.set(contact.id, contact);
  }
  return map;
}

function filleulExtraCells(
  contact: Contact,
  parrainById: Map<number, Contact>,
  dossiersByContactId?: Map<number, FilleulDossier>
): string[] {
  const parrain =
    contact.parrain_id != null ? parrainById.get(contact.parrain_id) : undefined;
  const dossier = contact.id != null ? dossiersByContactId?.get(contact.id) : undefined;
  const inscriptionTs = resolveFilleulInscriptionTimestamp(contact, dossier);
  return [
    parrain ? `${parrain.prenom} ${parrain.nom}`.trim() : "",
    inscriptionTs ? formatCalendarDateFr(inscriptionTs) : "",
    getFilleulTitreLabel(contact.filleul_titre) ?? contact.filleul_titre ?? "",
    getFilleulQualificationLabel(contact.filleul_qualification) ??
      contact.filleul_qualification ??
      "",
  ];
}

/** Prospects / suspects filleuls : contact seul, sans parrainage réseau. */
export function filleulExportIncludesParrainage(subTab: FilleulSubTab): boolean {
  return subTab === "FILLEUL" || subTab === "FILLEUL_DESINSCRIT";
}

/** Export filleuls : parrainage réseau pour filleuls actifs / désinscrits uniquement. */
export function buildFilleulsContactsCsv(
  contacts: Contact[],
  foyers: Foyer[],
  filleulSubTab: FilleulSubTab,
  allContactsForParrain: Contact[] = [],
  dossiersByContactId?: Map<number, FilleulDossier>
): string {
  const foyerById = new Map(foyers.map((f) => [f.id, f.nom]));
  const headers = buildFilleulsExportHeaders(filleulSubTab);
  const suffix = (contact: Contact) => dernierContactCell(contact, true);

  if (!filleulExportIncludesParrainage(filleulSubTab)) {
    const rows = contacts
      .filter((contact) => contact.id != null)
      .map((contact) => [
        ...filleulContactRowPrefix(contact, foyerById),
        ...suffix(contact),
      ]);
    return rowsToCsv([...headers], rows);
  }

  const parrainById = indexContactsById(allContactsForParrain);
  const rows = contacts
    .filter((contact) => contact.id != null)
    .map((contact) => [
      ...filleulContactRowPrefix(contact, foyerById),
      ...filleulExtraCells(contact, parrainById, dossiersByContactId),
      ...suffix(contact),
    ]);
  return rowsToCsv([...headers], rows);
}

export function buildContactsCsv(
  contacts: Contact[],
  foyers: Foyer[],
  patrimoines: Record<string, number>,
  patrimoinesAvecMoi: Record<string, number>,
  etiquettesParContact: Record<number, ContactEtiquetteDetails[]>,
  customColumns: CustomFieldColumn[] = []
): string {
  const foyerById = new Map(foyers.map((f) => [f.id, f.nom]));

  const headers = [
    "Prénom",
    "Nom",
    "Email",
    "Téléphone",
    "Catégorie",
    "Statut suivi",
    "Foyer",
    "Patrimoine total (€)",
    "Patrimoine avec moi (€)",
    "Étiquettes",
    "Ville",
    "Code postal",
    ...customColumns.map((col) => col.label),
  ];

  const rows = contacts.map((c) => {
    const etiqs = (etiquettesParContact[c.id!] ?? [])
      .map((e) => {
        const mode = e.attribue_par === "AUTO" ? "A" : "M";
        return `${e.etiquette_nom} (${mode})`;
      })
      .join(", ");

    return [
      c.prenom,
      c.nom,
      c.email ?? "",
      c.telephone ?? "",
      [getClientLabel(c.categorie), getFilleulLabel(c.filleul_categorie)]
        .filter(Boolean)
        .join(" · ") || c.categorie,
      c.statut_suivi,
      c.foyer_id != null ? foyerById.get(c.foyer_id) ?? String(c.foyer_id) : "",
      patrimoines[`contact_${c.id}`]?.toFixed(2) ?? "",
      patrimoinesAvecMoi[`contact_${c.id}`]?.toFixed(2) ?? "",
      etiqs,
      c.ville ?? "",
      c.code_postal ?? "",
      ...customColumns.map((col) => (c.id != null ? col.valuesByContact[c.id] ?? "" : "")),
    ];
  });

  return rowsToCsv(headers, rows);
}
