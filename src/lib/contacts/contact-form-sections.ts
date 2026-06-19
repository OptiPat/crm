import {
  AtSign,
  Briefcase,
  CalendarClock,
  StickyNote,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

/** IDs DOM des sections du formulaire contact (navigation sticky + scroll depuis Synthèse). */
export const CONTACT_FORM_SECTIONS = {
  identite: "contact-section-identite",
  coordonnees: "contact-section-coordonnees",
  viePro: "contact-section-vie-pro",
  roles: "contact-section-roles",
  relations: "contact-section-relations",
  notes: "contact-section-notes",
} as const;

export type ContactFormSectionKey = keyof typeof CONTACT_FORM_SECTIONS;

export type ContactFormSectionId =
  (typeof CONTACT_FORM_SECTIONS)[ContactFormSectionKey];

export const CONTACT_FORM_SECTION_ICON_CLASS =
  "h-4 w-4 shrink-0 text-muted-foreground";

export const CONTACT_SYNTHSE_SECTION_ICON_CLASS =
  "h-5 w-5 shrink-0 text-muted-foreground";

export const CONTACT_FORM_SECTION_META: Record<
  ContactFormSectionKey,
  { label: string; navLabel: string; icon: LucideIcon }
> = {
  identite: { label: "Identité", navLabel: "Identité", icon: UserCircle },
  coordonnees: { label: "Coordonnées", navLabel: "Coordonnées", icon: AtSign },
  viePro: {
    label: "Vie pro & fiscalité",
    navLabel: "Vie pro",
    icon: Briefcase,
  },
  roles: { label: "Rôles & suivi", navLabel: "Rôles", icon: CalendarClock },
  relations: { label: "Relations", navLabel: "Relations", icon: Users },
  notes: { label: "Notes", navLabel: "Notes", icon: StickyNote },
};

/** Sections affichées dans la nav sticky / synthèse (hors prescripteur création). */
export const CONTACT_FORM_EDIT_SECTION_KEYS: ContactFormSectionKey[] = [
  "identite",
  "coordonnees",
  "viePro",
  "roles",
  "relations",
  "notes",
];

export const CONTACT_FORM_PRESCRIPTEUR_SECTION_KEYS: ContactFormSectionKey[] = [
  "identite",
  "coordonnees",
  "viePro",
  "notes",
];
