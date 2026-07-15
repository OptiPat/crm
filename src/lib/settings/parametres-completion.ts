import type { CgpConfig } from "@/lib/api/tauri-settings";
import type { ComptaConfig } from "@/lib/api/tauri-compta";
import type { AgendaLink } from "@/lib/emails/agenda-links";

export type SettingsSectionId =
  | "accueil"
  | "profil"
  | "email-connexion"
  | "email-signature"
  | "email-google-contacts"
  | "email-historique"
  | "email-stellium"
  | "newsletter"
  | "suivi"
  | "remuneration"
  | "comptabilite"
  | "integrations"
  | "champs"
  | "donnees"
  | "application";

export type SetupCheckItem = {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  section: SettingsSectionId;
  /** Section retirée de Paramètres — ouvre une page dédiée. */
  externalPage?: "newsletter" | "comptabilite";
};

function hasText(value: string | undefined | null): boolean {
  return Boolean(value?.trim());
}

function hasValidAgendaLink(links: AgendaLink[] | undefined): boolean {
  return (links ?? []).some((l) => hasText(l.url) && hasText(l.label));
}

export function getSetupChecklist(
  config: CgpConfig,
  emailConnected: boolean,
  comptaConfig?: ComptaConfig | null
): SetupCheckItem[] {
  return [
    {
      id: "identity",
      label: "Identité complète",
      hint: "Prénom, nom et cabinet",
      done: hasText(config.prenom) && hasText(config.nom) && hasText(config.cabinet),
      section: "profil",
    },
    {
      id: "contact",
      label: "Coordonnées professionnelles",
      hint: "Email et téléphone",
      done: hasText(config.email) && hasText(config.telephone),
      section: "profil",
    },
    {
      id: "logo",
      label: "Logo du cabinet",
      hint: "Optionnel — bandeau profil",
      done: hasText(config.logo_path),
      section: "profil",
    },
    {
      id: "agenda",
      label: "Lien Google Agenda",
      hint: "Au moins une page de réservation",
      done: hasValidAgendaLink(config.agenda_links),
      section: "suivi",
    },
    {
      id: "oauth",
      label: "Boîte mail connectée",
      hint: "Google ou Microsoft (OAuth)",
      done: emailConnected,
      section: "email-connexion",
    },
    {
      id: "signature",
      label: "Signature email",
      hint: "Texte ou import Gmail",
      done:
        hasText(config.email_signature) || hasText(config.email_signature_html),
      section: "email-signature",
    },
    {
      id: "compta",
      label: "Comptabilité configurée",
      hint: "Adresse de départ et dossier Drive racine",
      done:
        hasText(comptaConfig?.adresseDepart) &&
        hasText(comptaConfig?.driveRootFolderId),
      section: "comptabilite",
      externalPage: "comptabilite",
    },
  ];
}

export function getCompletionPercent(items: SetupCheckItem[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}

export function getDisplayName(config: CgpConfig): string {
  const full = [config.prenom, config.nom].filter(Boolean).join(" ").trim();
  return full || "Conseiller";
}

export function getInitials(config: CgpConfig): string {
  const p = config.prenom?.trim().charAt(0) ?? "";
  const n = config.nom?.trim().charAt(0) ?? "";
  const letters = (p + n).toUpperCase();
  return letters || "?";
}
