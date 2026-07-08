import type { SettingsSectionId } from "@/lib/settings/parametres-completion";

const EMAIL_TAB_ALIASES: Record<string, SettingsSectionId> = {
  connexion: "email-connexion",
  signature: "email-signature",
  "google-contacts": "email-google-contacts",
  historique: "email-historique",
  stellium: "email-stellium",
};

/** Résout section legacy (`email`) + ancien onglet sessionStorage vers une section nav. */
export function resolveSettingsSection(
  section: string,
  emailTab?: string
): SettingsSectionId {
  if (section === "email") {
    if (emailTab && EMAIL_TAB_ALIASES[emailTab]) {
      return EMAIL_TAB_ALIASES[emailTab];
    }
    return "email-connexion";
  }
  return section as SettingsSectionId;
}

export function isEmailSettingsSection(section: SettingsSectionId): boolean {
  return section.startsWith("email-");
}
