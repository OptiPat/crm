import type { Contact } from "@/lib/api/tauri-contacts";
import type { ContactsUiState } from "@/lib/contacts/contacts-session";

export type ClientSubTab = ContactsUiState["clientSubTab"];
export type FilleulSubTab = ContactsUiState["filleulSubTab"];

export type ContactCategoryCounts = {
  CLIENT: number;
  CLIENT_ANCIEN: number;
  PROSPECT_CLIENT: number;
  SUSPECT_CLIENT: number;
  FILLEUL: number;
  PROSPECT_FILLEUL: number;
  SUSPECT_FILLEUL: number;
  FILLEUL_DESINSCRIT: number;
};

/** Client sans encours actif (statut EN_PAUSE, affiché « Ancien client »). */
export function isAncienClient(
  contact: Pick<Contact, "categorie" | "statut_suivi">
): boolean {
  return contact.categorie === "CLIENT" && contact.statut_suivi === "EN_PAUSE";
}

export function contactMatchesClientSubTab(
  contact: Pick<Contact, "categorie" | "statut_suivi">,
  subTab: ClientSubTab
): boolean {
  switch (subTab) {
    case "CLIENT":
      return contact.categorie === "CLIENT" && contact.statut_suivi !== "EN_PAUSE";
    case "CLIENT_ANCIEN":
      return isAncienClient(contact);
    case "PROSPECT_CLIENT":
      return contact.categorie === "PROSPECT_CLIENT";
    case "SUSPECT_CLIENT":
      return contact.categorie === "SUSPECT_CLIENT";
    default:
      return false;
  }
}

export function countContactCategories(contacts: Contact[]): ContactCategoryCounts {
  const counts: ContactCategoryCounts = {
    CLIENT: 0,
    CLIENT_ANCIEN: 0,
    PROSPECT_CLIENT: 0,
    SUSPECT_CLIENT: 0,
    FILLEUL: 0,
    PROSPECT_FILLEUL: 0,
    SUSPECT_FILLEUL: 0,
    FILLEUL_DESINSCRIT: 0,
  };

  for (const c of contacts) {
    if (c.categorie === "CLIENT") {
      if (c.statut_suivi === "EN_PAUSE") {
        counts.CLIENT_ANCIEN++;
      } else {
        counts.CLIENT++;
      }
    } else if (c.categorie === "PROSPECT_CLIENT") {
      counts.PROSPECT_CLIENT++;
    } else if (c.categorie === "SUSPECT_CLIENT") {
      counts.SUSPECT_CLIENT++;
    }

    switch (c.filleul_categorie) {
      case "FILLEUL":
        counts.FILLEUL++;
        break;
      case "PROSPECT_FILLEUL":
        counts.PROSPECT_FILLEUL++;
        break;
      case "SUSPECT_FILLEUL":
        counts.SUSPECT_FILLEUL++;
        break;
      case "FILLEUL_DESINSCRIT":
        counts.FILLEUL_DESINSCRIT++;
        break;
    }
  }

  return counts;
}

/** Compat sessionStorage v1 (onglet « Désinvestis »). */
export function normalizeClientSubTab(value: string | undefined): ClientSubTab | undefined {
  if (value === "CLIENT_DESINVESTI") return "CLIENT_ANCIEN";
  if (
    value === "CLIENT" ||
    value === "PROSPECT_CLIENT" ||
    value === "SUSPECT_CLIENT" ||
    value === "CLIENT_ANCIEN"
  ) {
    return value;
  }
  return undefined;
}
