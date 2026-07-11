import type { SettingsSectionId } from "@/lib/settings/parametres-completion";
import type { ParametresExternalSection } from "@/lib/settings/parametres-nav";

export type ParametresSearchItem = {
  id: string;
  label: string;
  keywords: string[];
  section: SettingsSectionId;
  scrollToId?: string;
  externalPage?: ParametresExternalSection;
};

export const PARAMETRES_SEARCH_INDEX: ParametresSearchItem[] = [
  {
    id: "profil-identite",
    label: "Identité (prénom, nom, cabinet)",
    keywords: ["profil", "identité", "prénom", "nom", "cabinet", "conseiller"],
    section: "profil",
  },
  {
    id: "profil-coordonnees",
    label: "Coordonnées professionnelles",
    keywords: ["email", "téléphone", "tel", "site", "web", "coordonnées"],
    section: "profil",
  },
  {
    id: "profil-logo",
    label: "Logo du cabinet",
    keywords: ["logo", "image", "visuel", "bandeau"],
    section: "profil",
  },
  {
    id: "profil-adresse",
    label: "Adresse postale",
    keywords: ["adresse", "postal", "ville", "cp"],
    section: "profil",
  },
  {
    id: "profil-cif",
    label: "Documents CIF (SIREN, ORIAS)",
    keywords: ["cif", "siren", "orias", "anacofi", "rcs", "légal", "mission"],
    section: "profil",
    scrollToId: "parametres-documents-cif",
  },
  {
    id: "email-connexion",
    label: "Connexion boîte mail (Google / Microsoft)",
    keywords: ["oauth", "gmail", "outlook", "microsoft", "connexion", "boîte", "mail"],
    section: "email-connexion",
  },
  {
    id: "email-signature",
    label: "Signature des emails",
    keywords: ["signature", "pied", "gmail", "import"],
    section: "email-signature",
  },
  {
    id: "email-google-contacts",
    label: "Synchronisation Google Contacts",
    keywords: ["google", "contacts", "iphone", "sync", "synchronisation"],
    section: "email-google-contacts",
  },
  {
    id: "email-historique",
    label: "Historique boîte mail (fiche contact)",
    keywords: ["historique", "sync", "relation", "client", "gmail"],
    section: "email-historique",
  },
  {
    id: "email-stellium",
    label: "Exceltis — détection mails Stellium",
    keywords: ["stellium", "exceltis", "remboursement", "millesime"],
    section: "email-stellium",
  },
  {
    id: "agenda",
    label: "Agenda & RDV",
    keywords: ["agenda", "rdv", "rendez-vous", "réservation", "lien_agenda", "visio", "zoom", "teams", "meet"],
    section: "suivi",
  },
  {
    id: "visio-defaut",
    label: "Lien Zoom / Teams",
    keywords: ["visio", "zoom", "teams", "lien", "rdv", "agenda"],
    section: "suivi",
  },
  {
    id: "api-locale",
    label: "API locale (n8n, anniversaires)",
    keywords: ["api", "locale", "n8n", "token", "port", "webhook"],
    section: "integrations",
  },
  {
    id: "telegram",
    label: "Anniversaires Telegram",
    keywords: ["telegram", "anniversaire", "bot", "rappel"],
    section: "integrations",
  },
  {
    id: "champs",
    label: "Champs personnalisés contact",
    keywords: ["champ", "personnalisé", "custom", "fiche"],
    section: "champs",
  },
  {
    id: "sauvegarde",
    label: "Sauvegarde et restauration",
    keywords: ["sauvegarde", "backup", "restaurer", "copie", "secours"],
    section: "donnees",
  },
  {
    id: "export",
    label: "Export archive complète",
    keywords: ["export", "archive", "usb", "dossier"],
    section: "donnees",
  },
  {
    id: "doublon",
    label: "Corriger un doublon de contact",
    keywords: ["doublon", "duplicate", "fusion"],
    section: "donnees",
  },
  {
    id: "nettoyage",
    label: "Nettoyage données fantômes",
    keywords: ["nettoyage", "fantôme", "orphelin", "maintenance"],
    section: "donnees",
  },
  {
    id: "mot-de-passe",
    label: "Changer le mot de passe",
    keywords: ["mot de passe", "password", "sécurité", "verrou", "accès"],
    section: "application",
  },
  {
    id: "mise-a-jour",
    label: "Mises à jour du logiciel",
    keywords: ["mise à jour", "update", "version", "télécharger"],
    section: "application",
  },
  {
    id: "licence",
    label: "Licence",
    keywords: ["licence", "activation", "abonnement"],
    section: "application",
  },
  {
    id: "branding-app",
    label: "Identité de l'application",
    keywords: ["branding", "titre", "application", "nom app"],
    section: "application",
  },
  {
    id: "newsletter-mistral",
    label: "Newsletter — clé API Mistral",
    keywords: ["newsletter", "mistral", "ia", "rédaction", "campagne"],
    section: "newsletter",
    externalPage: "newsletter",
  },
  {
    id: "compta-config",
    label: "Comptabilité — adresse km et Drive",
    keywords: ["comptabilité", "compta", "km", "drive", "déplacement"],
    section: "comptabilite",
    externalPage: "comptabilite",
  },
];

function normalizeSearchQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function filterParametresSearch(query: string): ParametresSearchItem[] {
  const q = normalizeSearchQuery(query);
  if (!q) return [];

  return PARAMETRES_SEARCH_INDEX.filter((item) => {
    const haystack = normalizeSearchQuery([item.label, ...item.keywords].join(" "));
    return haystack.includes(q) || item.keywords.some((kw) => normalizeSearchQuery(kw).includes(q));
  });
}
