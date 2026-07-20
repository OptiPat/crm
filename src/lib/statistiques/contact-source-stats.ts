import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { isClientActif, isFilleulReseauSigne, isFilleulStatut, isPrescripteurCategorie } from "@/lib/contacts/contact-form-utils";

/** Clé interne pour les contacts sans source / lead renseigné. */
export const CONTACT_SOURCE_LEAD_UNSET_KEY = "__UNSET__";

export const CONTACT_SOURCE_LEAD_UNSET_LABEL = "Non renseigné";

export type SourceLeadStatsLens = "client" | "filleul";

export type ContactSourceLeadStatsOptions = {
  /** Contact « Moi » (profil CGP) — filtre les filleuls hors réseau direct. */
  selfContactId?: number | null;
};

export type ContactSourceLeadStatRow = {
  key: string;
  label: string;
  count: number;
  percent: number;
  contactIds: number[];
};

export type ContactSourceLeadInvestissementStatRow = {
  key: string;
  label: string;
  /** Contacts éligibles rattachés à cette source. */
  contactCount: number;
  /** Contacts ayant signé (investissement « avec moi » ou filleul inscrit). */
  signedContactCount: number;
  /** Part des contacts de la source ayant signé. */
  conversionPercent: number;
  count: number;
  montantCentimes: number;
  percent: number;
  investissementIds: number[];
  contactIds: number[];
};

function isClientRoleForSourceLeadStats(categorie?: string): boolean {
  return isClientActif(categorie) && !isFilleulStatut(categorie);
}

function contactEffectiveFilleulCategorie(
  contact: Pick<Contact, "filleul_categorie" | "categorie">
): string | null | undefined {
  if (contact.filleul_categorie) return contact.filleul_categorie;
  if (isFilleulStatut(contact.categorie)) return contact.categorie;
  return null;
}

/** Prospect filleul éligible (parrain = CGP ou parrain non renseigné). */
export function isProspectFilleulForSourceLeadStats(
  contact: Pick<Contact, "categorie" | "filleul_categorie" | "parrain_id">,
  selfContactId?: number | null
): boolean {
  const filleulCat = contactEffectiveFilleulCategorie(contact);
  if (filleulCat !== "PROSPECT_FILLEUL") return false;
  if (contact.parrain_id == null) return true;
  if (selfContactId == null) return false;
  return contact.parrain_id === selfContactId;
}

/** Filleul inscrit ou désinscrit — parrain = CGP uniquement. */
export function isInscritFilleulForSourceLeadStats(
  contact: Pick<Contact, "filleul_categorie" | "categorie" | "parrain_id">,
  selfContactId?: number | null
): boolean {
  const filleulCat = contactEffectiveFilleulCategorie(contact);
  if (filleulCat !== "FILLEUL" && filleulCat !== "FILLEUL_DESINSCRIT") return false;
  if (selfContactId == null) return false;
  return contact.parrain_id === selfContactId;
}

/** Lentille client : rôle client actif, suspects clients exclus. Double rôle client+filleul inclus. */
export function isContactEligibleForClientSourceLeadStats(contact: Contact): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  if (contact.categorie === "SUSPECT_CLIENT") return false;
  return isClientRoleForSourceLeadStats(contact.categorie);
}

/** Lentille filleul : réseau direct, suspects filleuls exclus. Double rôle client+filleul inclus. */
export function isContactEligibleForFilleulSourceLeadStats(
  contact: Contact,
  options?: ContactSourceLeadStatsOptions
): boolean {
  if (isPrescripteurCategorie(contact.categorie)) return false;
  const filleulCat = contactEffectiveFilleulCategorie(contact);
  if (filleulCat === "SUSPECT_FILLEUL") return false;
  const selfContactId = options?.selfContactId;
  return (
    isProspectFilleulForSourceLeadStats(contact, selfContactId) ||
    isInscritFilleulForSourceLeadStats(contact, selfContactId)
  );
}

function isContactEligibleForLens(
  contact: Contact,
  options: ContactSourceLeadStatsOptions | undefined,
  lens: SourceLeadStatsLens
): boolean {
  return lens === "client"
    ? isContactEligibleForClientSourceLeadStats(contact)
    : isContactEligibleForFilleulSourceLeadStats(contact, options);
}

function normalizeSourceLeadKey(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLocaleLowerCase("fr");
  if (lowered === "non renseigné" || lowered === "non renseigne") return null;
  return trimmed;
}

function sourceLeadGroupKeyFromContact(contact: Contact): string {
  const source = normalizeSourceLeadKey(contact.source_lead);
  if (!source) return CONTACT_SOURCE_LEAD_UNSET_KEY;
  return source.toLocaleLowerCase("fr");
}

export function contactSourceLeadDisplayLabel(key: string): string {
  return key === CONTACT_SOURCE_LEAD_UNSET_KEY ? CONTACT_SOURCE_LEAD_UNSET_LABEL : key;
}

function sourceLeadRowFromContact(contact: Contact): { key: string; label: string } {
  const key = sourceLeadGroupKeyFromContact(contact);
  if (key === CONTACT_SOURCE_LEAD_UNSET_KEY) {
    return { key, label: CONTACT_SOURCE_LEAD_UNSET_LABEL };
  }
  const trimmed = contact.source_lead?.trim();
  return { key, label: trimmed || key };
}

/** Contact éligible (lentille client) auquel rattacher un investissement « avec moi ». */
export function resolveSourceLeadAttributionContactId(
  inv: Pick<Investissement, "origine" | "contact_id" | "foyer_id">,
  contacts: Contact[],
  _options?: ContactSourceLeadStatsOptions
): number | null {
  if (inv.origine !== "MON_CONSEIL") return null;

  if (inv.contact_id != null) {
    const contact = contacts.find((c) => c.id === inv.contact_id);
    if (contact && isContactEligibleForClientSourceLeadStats(contact)) {
      return contact.id;
    }
    return null;
  }

  if (inv.foyer_id != null) {
    const members = contacts
      .filter(
        (c) =>
          c.id != null &&
          c.foyer_id === inv.foyer_id &&
          isContactEligibleForClientSourceLeadStats(c)
      )
      .sort((a, b) => a.id! - b.id!);
    return members[0]?.id ?? null;
  }

  return null;
}

/** Filleul inscrit dans le réseau du CGP (parrain = profil « Moi »). */
export function contactHasSignedAsFilleulParrain(
  contact: Pick<Contact, "filleul_categorie" | "categorie" | "parrain_id">,
  selfContactId?: number | null
): boolean {
  if (selfContactId == null) return false;
  if (contact.parrain_id !== selfContactId) return false;
  return isFilleulReseauSigne(contactEffectiveFilleulCategorie(contact));
}

/** Au moins un support « avec moi » rattaché au contact (direct ou via le foyer). */
export function contactHasSignedAvecMoi(
  contact: Pick<Contact, "id" | "foyer_id">,
  investissements: Investissement[]
): boolean {
  return investissements.some((inv) => {
    if (inv.origine !== "MON_CONSEIL") return false;
    if (inv.contact_id != null) return inv.contact_id === contact.id;
    return (
      inv.contact_id == null &&
      inv.foyer_id != null &&
      contact.foyer_id != null &&
      inv.foyer_id === contact.foyer_id
    );
  });
}

function contactCountsAsSignedForLens(
  contact: Contact,
  investissements: Investissement[],
  options: ContactSourceLeadStatsOptions | undefined,
  lens: SourceLeadStatsLens
): boolean {
  if (lens === "client") {
    return contactHasSignedAvecMoi(contact, investissements);
  }
  return contactHasSignedAsFilleulParrain(contact, options?.selfContactId);
}

function sortSourceLeadRows<T extends { key: string; count: number; label: string }>(
  rows: T[]
): T[] {
  return rows.sort((a, b) => {
    if (a.key === CONTACT_SOURCE_LEAD_UNSET_KEY) return 1;
    if (b.key === CONTACT_SOURCE_LEAD_UNSET_KEY) return -1;
    return b.count - a.count || a.label.localeCompare(b.label, "fr");
  });
}

export function computeContactSourceLeadStats(
  contacts: Contact[],
  options?: ContactSourceLeadStatsOptions,
  lens: SourceLeadStatsLens = "client"
): { total: number; rows: ContactSourceLeadStatRow[] } {
  const eligible = contacts.filter((contact) => isContactEligibleForLens(contact, options, lens));
  const total = eligible.length;
  if (total === 0) {
    return { total: 0, rows: [] };
  }

  const groups = new Map<string, { label: string; contactIds: number[] }>();

  for (const contact of eligible) {
    const { key: groupKey, label } = sourceLeadRowFromContact(contact);
    const existing = groups.get(groupKey);
    if (existing) {
      existing.contactIds.push(contact.id);
      continue;
    }
    groups.set(groupKey, { label, contactIds: [contact.id] });
  }

  const rows: ContactSourceLeadStatRow[] = sortSourceLeadRows(
    [...groups.entries()].map(([key, group]) => ({
      key,
      label: group.label,
      count: group.contactIds.length,
      percent: (group.contactIds.length / total) * 100,
      contactIds: group.contactIds,
    }))
  );

  return { total, rows };
}

export function filterContactsBySourceLeadKey(
  contacts: Contact[],
  key: string,
  options?: ContactSourceLeadStatsOptions,
  lens: SourceLeadStatsLens = "client"
): Contact[] {
  return contacts
    .filter((contact) => isContactEligibleForLens(contact, options, lens))
    .filter((contact) => sourceLeadGroupKeyFromContact(contact) === key);
}

export function computeContactSourceLeadInvestissementStats(
  contacts: Contact[],
  investissements: Investissement[],
  options?: ContactSourceLeadStatsOptions,
  lens: SourceLeadStatsLens = "client"
): { total: number; totalMontantCentimes: number; rows: ContactSourceLeadInvestissementStatRow[] } {
  const contactStats = computeContactSourceLeadStats(contacts, options, lens);
  if (contactStats.total === 0) {
    return { total: 0, totalMontantCentimes: 0, rows: [] };
  }

  const eligibleById = new Map(
    contacts
      .filter((contact) => isContactEligibleForLens(contact, options, lens))
      .filter((contact) => contact.id != null)
      .map((contact) => [contact.id!, contact])
  );

  const signedContactIds = new Set<number>();
  for (const contact of eligibleById.values()) {
    if (contactCountsAsSignedForLens(contact, investissements, options, lens)) {
      signedContactIds.add(contact.id);
    }
  }

  const investmentGroups = new Map<
    string,
    {
      investissementIds: number[];
      montantCentimes: number;
    }
  >();
  let total = 0;
  let totalMontantCentimes = 0;

  if (lens === "client") {
    for (const inv of investissements) {
      const contactId = resolveSourceLeadAttributionContactId(inv, contacts, options);
      if (contactId == null) continue;

      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) continue;

      const { key: groupKey } = sourceLeadRowFromContact(contact);
      const montant = inv.montant_initial ?? 0;
      total += 1;
      totalMontantCentimes += montant;

      const existing = investmentGroups.get(groupKey);
      if (existing) {
        existing.investissementIds.push(inv.id);
        existing.montantCentimes += montant;
        continue;
      }
      investmentGroups.set(groupKey, {
        investissementIds: [inv.id],
        montantCentimes: montant,
      });
    }
  }

  const rows: ContactSourceLeadInvestissementStatRow[] = contactStats.rows
    .map((contactRow) => {
      const investmentGroup = investmentGroups.get(contactRow.key);
      const signedContactCount = contactRow.contactIds.filter((id) =>
        signedContactIds.has(id)
      ).length;
      const supportCount = investmentGroup?.investissementIds.length ?? 0;
      return {
        key: contactRow.key,
        label: contactRow.label,
        contactCount: contactRow.count,
        signedContactCount,
        conversionPercent:
          contactRow.count > 0 ? (signedContactCount / contactRow.count) * 100 : 0,
        count: supportCount,
        montantCentimes: investmentGroup?.montantCentimes ?? 0,
        percent: total > 0 ? (supportCount / total) * 100 : 0,
        investissementIds: investmentGroup?.investissementIds ?? [],
        contactIds: contactRow.contactIds,
      };
    })
    .sort((a, b) => {
      if (a.key === CONTACT_SOURCE_LEAD_UNSET_KEY) return 1;
      if (b.key === CONTACT_SOURCE_LEAD_UNSET_KEY) return -1;
      if (lens === "client") {
        return (
          b.montantCentimes - a.montantCentimes ||
          b.conversionPercent - a.conversionPercent ||
          b.signedContactCount - a.signedContactCount ||
          b.count - a.count ||
          a.label.localeCompare(b.label, "fr")
        );
      }
      return (
        b.conversionPercent - a.conversionPercent ||
        b.signedContactCount - a.signedContactCount ||
        b.contactCount - a.contactCount ||
        a.label.localeCompare(b.label, "fr")
      );
    });

  return { total, totalMontantCentimes, rows };
}

export function filterInvestissementsBySourceLeadKey(
  contacts: Contact[],
  investissements: Investissement[],
  key: string,
  options?: ContactSourceLeadStatsOptions
): Investissement[] {
  return investissements.filter((inv) => {
    const contactId = resolveSourceLeadAttributionContactId(inv, contacts, options);
    if (contactId == null) return false;
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return false;
    return sourceLeadGroupKeyFromContact(contact) === key;
  });
}
