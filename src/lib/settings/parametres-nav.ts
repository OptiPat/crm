import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  User,
  Mail,
  FileSignature,
  Contact,
  History,
  Inbox,
  CalendarClock,
  Database,
  SlidersHorizontal,
  Workflow,
  Sparkles,
} from "lucide-react";
import type { SettingsSectionId } from "@/lib/settings/parametres-completion";

export type SettingsNavGroupId = "cabinet" | "communication" | "automatisations" | "technique";

export type SettingsNavItem = {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type SettingsNavGroup = {
  id: SettingsNavGroupId;
  label: string;
  items: SettingsNavItem[];
};

/** Sections retirées de la nav Paramètres — redirection vers une page dédiée. */
export const PARAMETRES_EXTERNAL_SECTIONS = ["newsletter", "comptabilite"] as const;

export type ParametresExternalSection = (typeof PARAMETRES_EXTERNAL_SECTIONS)[number];

export function isParametresExternalSection(
  section: SettingsSectionId
): section is ParametresExternalSection {
  return (PARAMETRES_EXTERNAL_SECTIONS as readonly string[]).includes(section);
}

export function parametresExternalPage(
  section: ParametresExternalSection
): "newsletter" | "comptabilite" {
  return section;
}

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    id: "cabinet",
    label: "Mon cabinet",
    items: [
      {
        id: "accueil",
        label: "Vue d'ensemble",
        description: "État du compte et checklist",
        icon: LayoutDashboard,
      },
      {
        id: "profil",
        label: "Profil",
        description: "Identité et coordonnées",
        icon: User,
      },
    ],
  },
  {
    id: "communication",
    label: "Emails & envois",
    items: [
      {
        id: "email-connexion",
        label: "Connexion",
        description: "Google ou Microsoft (OAuth)",
        icon: Mail,
      },
      {
        id: "email-signature",
        label: "Signature",
        description: "Texte et import Gmail",
        icon: FileSignature,
      },
      {
        id: "email-google-contacts",
        label: "Google Contacts",
        description: "Sync contacts CRM ↔ iPhone",
        icon: Contact,
      },
      {
        id: "email-historique",
        label: "Historique fiche",
        description: "Sync boîte mail sur fiche contact",
        icon: History,
      },
      {
        id: "email-stellium",
        label: "Exceltis Stellium",
        description: "Détection mails remboursements",
        icon: Inbox,
      },
    ],
  },
  {
    id: "automatisations",
    label: "Automatisations",
    items: [
      {
        id: "suivi",
        label: "Agenda & RDV",
        description: "Liens Google Agenda",
        icon: CalendarClock,
      },
      {
        id: "integrations",
        label: "Intégrations",
        description: "API locale et Telegram",
        icon: Workflow,
      },
    ],
  },
  {
    id: "technique",
    label: "Données & technique",
    items: [
      {
        id: "champs",
        label: "Champs personnalisés",
        description: "Champs sur mesure des fiches contact",
        icon: SlidersHorizontal,
      },
      {
        id: "donnees",
        label: "Sauvegardes & maintenance",
        description: "Base locale, export et nettoyage",
        icon: Database,
      },
      {
        id: "application",
        label: "Logiciel",
        description: "Mises à jour et sécurité",
        icon: Sparkles,
      },
    ],
  },
];

export const SETTINGS_NAV_FLAT: SettingsNavItem[] = SETTINGS_NAV_GROUPS.flatMap((g) => g.items);
