import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";

export type EmailTemplateCategory =
  | "RELANCE"
  | "SUIVI_ANNUEL"
  | "FISCALITE"
  | "BIENVENUE"
  | "ARBITRAGE"
  | "AUTRE";

export const EMAIL_TEMPLATE_CATEGORIES: {
  id: EmailTemplateCategory;
  label: string;
  badgeClass: string;
}[] = [
  { id: "RELANCE", label: "Relance", badgeClass: "bg-orange-100 text-orange-800" },
  { id: "SUIVI_ANNUEL", label: "Suivi annuel", badgeClass: "bg-blue-100 text-blue-800" },
  { id: "FISCALITE", label: "Fiscalité", badgeClass: "bg-green-100 text-green-800" },
  { id: "BIENVENUE", label: "Bienvenue", badgeClass: "bg-yellow-100 text-yellow-800" },
  { id: "ARBITRAGE", label: "Arbitrage", badgeClass: "bg-purple-100 text-purple-800" },
  { id: "AUTRE", label: "Autre", badgeClass: "bg-gray-100 text-gray-800" },
];

/** Variables supportées par `replaceTemplateVariables` / file d'envoi. */
export const EMAIL_TEMPLATE_VARIABLES: {
  token: string;
  key: string;
  label: string;
  hint: string;
}[] = [
  { token: "{{prenom}}", key: "prenom", label: "Prénom contact", hint: "Fiche contact" },
  { token: "{{nom}}", key: "nom", label: "Nom contact", hint: "Fiche contact" },
  { token: "{{email}}", key: "email", label: "Email contact", hint: "Fiche contact" },
  { token: "{{telephone}}", key: "telephone", label: "Téléphone contact", hint: "Fiche contact" },
  { token: "{{lien_calendly}}", key: "lien_calendly", label: "Lien Calendly", hint: "Paramètres → Profil CGP" },
  { token: "{{cgp_prenom}}", key: "cgp_prenom", label: "Prénom conseiller", hint: "Profil CGP" },
  { token: "{{cgp_nom}}", key: "cgp_nom", label: "Nom conseiller", hint: "Profil CGP" },
  { token: "{{cgp_email}}", key: "cgp_email", label: "Email conseiller", hint: "Profil CGP" },
  { token: "{{cgp_telephone}}", key: "cgp_telephone", label: "Téléphone conseiller", hint: "Profil CGP" },
];

/** Nom d'étiquette système → nom de template par défaut suggéré. */
export const ETIQUETTE_NOM_TO_TEMPLATE_NOM: Record<string, string> = {
  "Suivi > 1 an": "Relance — client 1 an sans contact",
  "Suivi > 6 mois": "Relance — prospect 6 mois",
  "Déclaration IR": "Rappel déclaration IR",
  "Suivi à planifier": "Prise de rendez-vous suivi",
  "Fin démembrement": "Relance — échéance patrimoine",
  "Alerte 69 ans": "Rappel assurance-vie 69 ans",
};

export function getTemplateCategoryMeta(categorie: string) {
  return (
    EMAIL_TEMPLATE_CATEGORIES.find((c) => c.id === categorie) ?? {
      id: "AUTRE" as EmailTemplateCategory,
      label: categorie,
      badgeClass: "bg-gray-100 text-gray-800",
    }
  );
}

export function buildVariablesFromContact(
  contact: {
    prenom?: string | null;
    nom?: string | null;
    email?: string | null;
    telephone?: string | null;
  },
  cgp: CgpConfig | null
): Record<string, string> {
  return {
    prenom: contact.prenom ?? "",
    nom: contact.nom ?? "",
    email: contact.email ?? "",
    telephone: contact.telephone ?? "",
    lien_calendly: cgp?.lien_calendly ?? "",
    cgp_nom: cgp?.nom ?? "",
    cgp_prenom: cgp?.prenom ?? "",
    cgp_telephone: cgp?.telephone ?? "",
    cgp_email: cgp?.email ?? "",
  };
}

export const SAMPLE_PREVIEW_CONTACT = {
  prenom: "Marie",
  nom: "Dupont",
  email: "marie.dupont@example.com",
  telephone: "06 12 34 56 78",
};

export function renderTemplatePreview(
  sujet: string,
  corps: string,
  contact: Pick<Contact, "prenom" | "nom" | "email" | "telephone">,
  cgp: CgpConfig | null
): { subject: string; body: string } {
  const vars = buildVariablesFromContact(contact, cgp);
  return {
    subject: replaceTemplateVariables(sujet, vars),
    body: replaceTemplateVariables(corps, vars),
  };
}

/** Suggère un template pour une étiquette (nom exact ou catégorie RELANCE par défaut). */
export function suggestTemplateIdForEtiquette(
  etiquetteNom: string,
  templates: TemplateEmail[]
): number | null {
  const preferredNom = ETIQUETTE_NOM_TO_TEMPLATE_NOM[etiquetteNom.trim()];
  if (preferredNom) {
    const exact = templates.find((t) => t.nom === preferredNom);
    if (exact) return exact.id;
  }

  const lower = etiquetteNom.toLowerCase();
  if (lower.includes("ir") || lower.includes("fiscal")) {
    const t = templates.find((t) => t.categorie === "FISCALITE");
    if (t) return t.id;
  }
  if (lower.includes("6 mois") || lower.includes("prospect")) {
    const t = templates.find((t) => t.nom.includes("6 mois"));
    if (t) return t.id;
  }
  if (lower.includes("1 an") || lower.includes("suivi")) {
    const t = templates.find((t) => t.nom.includes("1 an"));
    if (t) return t.id;
  }

  const relance = templates.find((t) => t.categorie === "RELANCE");
  return relance?.id ?? templates[0]?.id ?? null;
}

export function duplicateTemplatePayload(template: TemplateEmail): {
  nom: string;
  sujet: string;
  corps: string;
  categorie: string;
  variables: string | null;
} {
  return {
    nom: `${template.nom} (copie)`,
    sujet: template.sujet,
    corps: template.corps,
    categorie: template.categorie,
    variables: template.variables,
  };
}
