import type { Contact } from "@/lib/api/tauri-contacts";
import { daysSinceUnix, JOURS_1_AN, JOURS_6_MOIS } from "@/lib/dates/calendar-date";

export type ContactPriorite = {
  rowClass: string;
  priorite: number;
  label: string;
  dotClass: string;
};

const PRIORITE_OK: ContactPriorite = {
  rowClass: "border-l-4 border-l-emerald-400/80",
  priorite: 3,
  label: "Suivi à jour",
  dotClass: "bg-emerald-500",
};

/** Priorité liste — onglet Clients (date_dernier_contact). */
export function getPrioriteContact(contact: Contact): ContactPriorite {
  if (!contact.date_dernier_contact) {
    if (contact.categorie === "CLIENT") {
      return {
        rowClass: "border-l-4 border-l-red-500 bg-red-50/40",
        priorite: 1,
        label: "Jamais suivi",
        dotClass: "bg-red-500",
      };
    }
    if (contact.categorie.includes("SUSPECT") || contact.categorie.includes("PROSPECT")) {
      return {
        rowClass: "border-l-4 border-l-orange-500 bg-orange-50/35",
        priorite: 2,
        label: "Jamais contacté",
        dotClass: "bg-orange-500",
      };
    }
    return { rowClass: "", priorite: 3, label: "", dotClass: "bg-muted" };
  }

  const diffDays = daysSinceUnix(contact.date_dernier_contact);

  if (contact.categorie === "CLIENT" && diffDays >= JOURS_1_AN) {
    return {
      rowClass: "border-l-4 border-l-red-500 bg-red-50/40",
      priorite: 1,
      label: "Suivi +1 an",
      dotClass: "bg-red-500",
    };
  }

  if (
    (contact.categorie.includes("SUSPECT") || contact.categorie.includes("PROSPECT")) &&
    diffDays >= JOURS_6_MOIS
  ) {
    return {
      rowClass: "border-l-4 border-l-orange-500 bg-orange-50/35",
      priorite: 2,
      label: "Suivi +6 mois",
      dotClass: "bg-orange-500",
    };
  }

  return {
    ...PRIORITE_OK,
    label: "Suivi < 1 an",
  };
}

/** Priorité liste — onglet Filleuls (date_dernier_contact_filleul). */
export function getPrioriteFilleul(contact: Contact): ContactPriorite {
  if (contact.filleul_categorie === "FILLEUL_DESINSCRIT") {
    return {
      rowClass: "border-l-4 border-l-slate-300 bg-muted/30",
      priorite: 99,
      label: "",
      dotClass: "bg-slate-400",
    };
  }

  if (!contact.date_dernier_contact_filleul) {
    return {
      rowClass: "border-l-4 border-l-orange-500 bg-orange-50/35",
      priorite: 2,
      label: "Jamais contacté",
      dotClass: "bg-orange-500",
    };
  }

  const diffDays = daysSinceUnix(contact.date_dernier_contact_filleul);

  if (diffDays >= JOURS_1_AN) {
    return {
      rowClass: "border-l-4 border-l-red-500 bg-red-50/40",
      priorite: 1,
      label: "Suivi +1 an",
      dotClass: "bg-red-500",
    };
  }

  if (diffDays >= JOURS_6_MOIS) {
    return {
      rowClass: "border-l-4 border-l-orange-500 bg-orange-50/35",
      priorite: 2,
      label: "Suivi +6 mois",
      dotClass: "bg-orange-500",
    };
  }

  return {
    ...PRIORITE_OK,
    label: "Suivi < 6 mois",
  };
}

export function getContactPriorite(contact: Contact, isFilleulTab: boolean): ContactPriorite {
  return isFilleulTab ? getPrioriteFilleul(contact) : getPrioriteContact(contact);
}
