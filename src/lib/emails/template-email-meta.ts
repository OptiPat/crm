import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import {
  isEphemeralTemplate,
  stampNewEphemeralTemplateMeta,
} from "@/lib/emails/template-email-ephemeral";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";
import {
  buildTemplateSendBodies,
  canonicalizeTemplateCorpsHtml,
  getTemplateCorpsHtml,
  prepareTemplateHtmlForSend,
} from "@/lib/emails/template-email-html";
import { appendEmailSignature } from "@/lib/emails/email-signature";
import {
  buildAgendaTemplateVariables,
  normalizeAgendaLinks,
  agendaLinkVariableToken,
  type AgendaLink,
} from "@/lib/emails/agenda-links";
import {
  EXCELITIS_EMAIL_TEMPLATE_NOM,
  isExceltisEtiquetteNom,
} from "@/lib/etiquettes/exceltis";
import {
  buildScpiBulletinPreviewVariables,
  templateUsesScpiBulletinVariables,
} from "@/lib/emails/scpi-bulletin-preview-vars";
import {
  buildStelliumPerfPreviewVariables,
  alignStelliumVarsForRegistre,
  repairStelliumTemplateForRegistre,
  repairStelliumTemplateHtmlForRegistre,
  stripOrphanStelliumFormalityHtml,
  stripOrphanStelliumFormalityLines,
  templateUsesStelliumPerfVariables,
} from "@/lib/emails/stellium-perf-preview-vars";
import { isStelliumPerfTemplateNom } from "@/lib/emails/stellium-template-meta";
import type { ContactRegistre } from "@/lib/emails/template-email-formality";

export type EmailTemplateCategory =
  | "RELANCE"
  | "SUIVI_ANNUEL"
  | "FISCALITE"
  | "BIENVENUE"
  | "ARBITRAGE"
  | "NEWSLETTER"
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
  { id: "NEWSLETTER", label: "Newsletter", badgeClass: "bg-indigo-100 text-indigo-800" },
  { id: "AUTRE", label: "Autre", badgeClass: "bg-gray-100 text-gray-800" },
];

/** Variables contact + CGP (hors liens agenda). */
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
  { token: "{{cgp_prenom}}", key: "cgp_prenom", label: "Prénom conseiller", hint: "Profil CGP" },
  { token: "{{cgp_nom}}", key: "cgp_nom", label: "Nom conseiller", hint: "Profil CGP" },
  { token: "{{cgp_email}}", key: "cgp_email", label: "Email conseiller", hint: "Profil CGP" },
  { token: "{{cgp_telephone}}", key: "cgp_telephone", label: "Téléphone conseiller", hint: "Profil CGP" },
  {
    token: "{{millesime}}",
    key: "millesime",
    label: "Millésime Exceltis",
    hint: "Ex. Février 2025 — extrait du nom d'étiquette",
  },
  {
    token: "{{etiquette_nom}}",
    key: "etiquette_nom",
    label: "Nom de l'étiquette",
    hint: "Campagne liée (ex. Exceltis — Août 2026)",
  },
  {
    token: "{{periode}}",
    key: "periode",
    label: "Période bulletin SCPI",
    hint: "Ex. T1 2026 — campagne bulletins",
  },
  {
    token: "{{scpi_intro_tu}}",
    key: "scpi_intro_tu",
    label: "Intro bulletin (tu)",
    hint: "Phrase d'accroche — ta SCPI / tes SCPI selon le contact",
  },
  {
    token: "{{scpi_intro_vous}}",
    key: "scpi_intro_vous",
    label: "Intro bulletin (vous)",
    hint: "Phrase d'accroche — votre SCPI / vos SCPI selon le contact",
  },
  {
    token: "{{bulletin_resume}}",
    key: "bulletin_resume",
    label: "Résumé bulletins SCPI (texte)",
    hint: "Contenu agrégé injecté par Préparer SCPI",
  },
  {
    token: "{{bulletin_resume_html}}",
    key: "bulletin_resume_html",
    label: "Résumé bulletins SCPI (HTML)",
    hint: "Version HTML — modèles avec mise en forme",
  },
];

export function getAgendaVariableTokens(links: AgendaLink[]) {
  const tokens: { token: string; label: string; hint: string }[] = [
    {
      token: "{{lien_agenda}}",
      label: "Lien Google Agenda (choix du template)",
      hint: "Paramètres → liens + sélection dans le template",
    },
  ];
  for (const link of links) {
    tokens.push({
      token: agendaLinkVariableToken(link.id),
      label: link.label,
      hint: "Lien fixe (tous templates)",
    });
  }
  return tokens;
}

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
  cgp: CgpConfig | null,
  templateAgendaLinkId?: string | null
): Record<string, string> {
  return {
    prenom: contact.prenom ?? "",
    nom: contact.nom ?? "",
    email: contact.email ?? "",
    telephone: contact.telephone ?? "",
    cabinet: cgp?.cabinet?.trim() ?? "",
    cgp_nom: cgp?.nom ?? "",
    cgp_prenom: cgp?.prenom ?? "",
    cgp_telephone: cgp?.telephone ?? "",
    cgp_email: cgp?.email ?? "",
    ...buildAgendaTemplateVariables(cgp, templateAgendaLinkId),
  };
}

export const SAMPLE_PREVIEW_CONTACT = {
  prenom: "Marie",
  nom: "Dupont",
  email: "marie.dupont@example.com",
  telephone: "06 12 34 56 78",
};

/** Valeurs d'exemple pour l'aperçu des modèles Exceltis. */
export const SAMPLE_EXCELITIS_TEMPLATE_VARS = {
  millesime: "Février 2025",
  etiquette_nom: "Exceltis — Février 2025",
} as const;

export function renderTemplatePreview(
  sujet: string,
  corps: string,
  contact: typeof SAMPLE_PREVIEW_CONTACT,
  cgp: CgpConfig | null,
  templateAgendaLinkId?: string | null,
  templateVariables?: string | null,
  /** HTML en cours d’édition (prioritaire sur `variables.corps_html`). */
  corpsHtmlOverride?: string | null,
  options?: {
    templateNom?: string | null;
    registre?: ContactRegistre | null;
  }
): { subject: string; body: string; body_html: string | null } {
  const corpsHtmlStored =
    corpsHtmlOverride?.trim() || getTemplateCorpsHtml(templateVariables);
  const usesScpiBulletin = templateUsesScpiBulletinVariables(
    sujet,
    corps,
    corpsHtmlStored
  );
  const usesStelliumPerf =
    isStelliumPerfTemplateNom(options?.templateNom ?? "") ||
    templateUsesStelliumPerfVariables(sujet, corps, corpsHtmlStored);
  const registre = options?.registre ?? "VOUS";
  const vars = alignStelliumVarsForRegistre(
    {
      ...buildVariablesFromContact(contact, cgp, templateAgendaLinkId),
      ...SAMPLE_EXCELITIS_TEMPLATE_VARS,
      ...(usesScpiBulletin ? buildScpiBulletinPreviewVariables() : {}),
      ...(usesStelliumPerf ? buildStelliumPerfPreviewVariables() : {}),
    },
    registre
  );
  const subject = replaceTemplateVariables(sujet, vars);
  const plainTemplate = usesStelliumPerf
    ? repairStelliumTemplateForRegistre(corps, registre)
    : corps;
  const plainCore = stripOrphanStelliumFormalityLines(
    replaceTemplateVariables(plainTemplate, vars)
  );
  const body = appendEmailSignature(plainCore, cgp?.email_signature);
  const htmlSource = corpsHtmlStored
    ? canonicalizeTemplateCorpsHtml(
        usesStelliumPerf
          ? repairStelliumTemplateHtmlForRegistre(corpsHtmlStored, registre)
          : corpsHtmlStored
      )
    : null;
  const bodyHtmlCore = htmlSource
    ? stripOrphanStelliumFormalityHtml(
        prepareTemplateHtmlForSend(htmlSource, vars)
      )
    : null;
  const { body_html } = buildTemplateSendBodies(body, bodyHtmlCore, cgp, {
    htmlAlreadyNormalized: Boolean(bodyHtmlCore),
  });
  return { subject, body, body_html };
}

export function suggestTemplateIdForEtiquette(
  etiquetteNom: string,
  templates: TemplateEmail[]
): number | null {
  const trimmed = etiquetteNom.trim();
  if (trimmed) {
    const exact = templates.find((t) => t.nom.trim() === trimmed);
    if (exact) return exact.id;
  }
  if (isExceltisEtiquetteNom(etiquetteNom)) {
    const exceltis = templates.find((t) => t.nom === EXCELITIS_EMAIL_TEMPLATE_NOM);
    if (exceltis) return exceltis.id;
  }
  const targetNom = ETIQUETTE_NOM_TO_TEMPLATE_NOM[etiquetteNom];
  if (!targetNom) return null;
  const found = templates.find((t) => t.nom === targetNom);
  return found?.id ?? null;
}

export function duplicateTemplatePayload(source: TemplateEmail): {
  nom: string;
  sujet: string;
  corps: string;
  categorie: string;
  variables: string | null;
  agenda_link_id: string | null;
} {
  return {
    nom: `${source.nom} (copie)`,
    sujet: source.sujet,
    corps: source.corps,
    categorie: source.categorie,
    variables: isEphemeralTemplate(source.variables)
      ? stampNewEphemeralTemplateMeta(null)
      : source.variables,
    agenda_link_id: source.agenda_link_id,
  };
}

export { normalizeAgendaLinks };
