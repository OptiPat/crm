import type { Contact } from "@/lib/api/tauri-contacts";
import { textMatchesSearch } from "@/lib/search-utils";
import type { OrganisationTreeResult } from "@/lib/organisation/organisation-tree";

export type OrganisationMemberStatus = "actif" | "desinscrit" | "self" | "upline";

export type OrganisationMemberRosterEntry = {
  contact: Contact;
  status: OrganisationMemberStatus;
  generation: number | null;
  parrainLabel: string | null;
  label: string;
};

export type OrganisationMemberStatusFilter = "all" | "actif" | "desinscrit";

function memberLabel(contact: Contact, suffix = ""): string {
  const base = `${contact.prenom ?? ""} ${contact.nom ?? ""}`.trim();
  return suffix ? `${base} ${suffix}` : base;
}

/** Tous les consultants du réseau (actifs, désinscrits, upline, CGP). */
export function collectOrganisationMemberRoster(
  tree: OrganisationTreeResult
): OrganisationMemberRosterEntry[] {
  const entries: OrganisationMemberRosterEntry[] = [];
  const seen = new Set<number>();

  const push = (entry: OrganisationMemberRosterEntry) => {
    if (entry.contact.id == null || seen.has(entry.contact.id)) return;
    seen.add(entry.contact.id);
    entries.push(entry);
  };

  if (tree.selfContact) {
    push({
      contact: tree.selfContact,
      status: "self",
      generation: 0,
      parrainLabel: null,
      label: memberLabel(tree.selfContact, "(vous)"),
    });
  }

  for (const node of tree.upline) {
    push({
      contact: node.contact,
      status: node.isDesinscrit ? "desinscrit" : "upline",
      generation: null,
      parrainLabel: null,
      label: memberLabel(node.contact),
    });
  }

  for (const layer of tree.generations) {
    for (const node of layer) {
      push({
        contact: node.contact,
        status: "actif",
        generation: node.generation,
        parrainLabel: node.parrainLabel,
        label: memberLabel(node.contact),
      });
    }
  }

  for (const entry of tree.desinscrits) {
    push({
      contact: entry.contact,
      status: "desinscrit",
      generation: entry.generation,
      parrainLabel: entry.parrainLabel,
      label: memberLabel(entry.contact),
    });
  }

  return entries.sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export function findOrganisationMemberRosterEntry(
  roster: OrganisationMemberRosterEntry[],
  contactId: number
): OrganisationMemberRosterEntry | undefined {
  return roster.find((entry) => entry.contact.id === contactId);
}

export function filterOrganisationMemberRoster(
  roster: OrganisationMemberRosterEntry[],
  query: string,
  statusFilter: OrganisationMemberStatusFilter = "all"
): OrganisationMemberRosterEntry[] {
  return roster.filter((entry) => {
    if (statusFilter === "actif" && entry.status === "desinscrit") return false;
    if (statusFilter === "desinscrit" && entry.status !== "desinscrit") return false;
    return textMatchesSearch(
      query,
      entry.contact.nom,
      entry.contact.prenom,
      entry.label,
      entry.parrainLabel
    );
  });
}

export function organisationMemberStatusLabel(status: OrganisationMemberStatus): string {
  switch (status) {
    case "actif":
      return "Actif";
    case "desinscrit":
      return "Désinscrit";
    case "self":
      return "Vous";
    case "upline":
      return "Parrain";
  }
}

/** Libellé affiché : niveau 1, 2, 3… (pas « génération »). */
export function organisationMemberLevelLabel(level: number | null | undefined): string | null {
  if (level == null || level <= 0) return null;
  return `Niveau ${level}`;
}
