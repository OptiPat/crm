import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import {
  isTemplateEmailRelanceEnabledForQueue,
  parseTemplateEmailRelance,
} from "@/lib/emails/template-email-relance";
import { parseTemplateEmailTrigger } from "@/lib/emails/template-email-trigger";
import {
  isEphemeralTemplate,
  parseEphemeralCampaignConfig,
} from "@/lib/emails/template-email-ephemeral";

export type TemplateActivationStatFilter =
  | "trigger"
  | "etiquette"
  | "relance"
  | "no_channel";

export const TEMPLATE_ACTIVATION_MODE_OPTIONS: {
  id: TemplateActivationStatFilter;
  label: string;
}[] = [
  { id: "trigger", label: "Déclencheur" },
  { id: "etiquette", label: "Étiquette" },
  { id: "relance", label: "Relance" },
  { id: "no_channel", label: "Sans canal" },
];

export const TEMPLATE_ACTIVATION_MODE_LABELS: Record<TemplateActivationStatFilter, string> = {
  trigger: "Déclencheur",
  etiquette: "Étiquette",
  relance: "Relance",
  no_channel: "Sans canal",
};

export interface TemplateActivationFlags {
  hasTrigger: boolean;
  hasEtiquetteLink: boolean;
  hasRelance: boolean;
  hasTutoiement: boolean;
  /** Au moins un canal de 1er envoi (déclencheur ou étiquette). */
  hasSendChannel: boolean;
  /** Aucun canal de 1er envoi — message stocké seulement. */
  isLibraryOnly: boolean;
}

const TRIGGER_SHORT_LABELS: Record<string, string> = {
  DELAI_SANS_CONTACT: "Délai sans contact",
  DATE_APPROCHE: "Date approche",
  PERIODE_ANNEE: "Période année",
  TYPE_PRODUIT: "Type produit",
  DATE_APPROCHE_INVESTISSEMENT: "Date investissement",
  AGE_APPROCHE: "Âge cible",
  EVENEMENT_SOUSCRIPTION: "Souscription",
};

export function getTemplateActivationFlags(
  template: TemplateEmail,
  etiquetteLinkCount: number
): TemplateActivationFlags {
  const trigger = parseTemplateEmailTrigger(template.variables);
  const hasTrigger = trigger.enabled && Boolean(trigger.condition_type?.trim());
  const hasEtiquetteLink = etiquetteLinkCount > 0;
  const hasRelance =
    template.relance_template_id != null &&
    isTemplateEmailRelanceEnabledForQueue(template.variables);
  const hasTutoiement = template.tutoiement_template_id != null;
  const hasSendChannel = hasTrigger || hasEtiquetteLink;

  return {
    hasTrigger,
    hasEtiquetteLink,
    hasRelance,
    hasTutoiement,
    hasSendChannel,
    isLibraryOnly: !hasSendChannel,
  };
}

export function getTemplateTriggerShortLabel(
  template: Pick<TemplateEmail, "variables">
): string | null {
  const trigger = parseTemplateEmailTrigger(template.variables);
  if (!trigger.enabled || !trigger.condition_type?.trim()) return null;
  return (
    TRIGGER_SHORT_LABELS[trigger.condition_type] ??
    trigger.condition_type.replace(/_/g, " ").toLowerCase()
  );
}

export function getTemplateRelanceBadgeLabel(
  template: Pick<TemplateEmail, "variables" | "relance_template_id">
): string | null {
  if (template.relance_template_id == null) return null;
  if (!isTemplateEmailRelanceEnabledForQueue(template.variables)) return null;
  const relance = parseTemplateEmailRelance(template.variables);
  if (relance.delai_jours != null) {
    return `Relance J+${relance.delai_jours}`;
  }
  return "Relance";
}

export function getEphemeralCampaignBadgeLabel(
  template: Pick<TemplateEmail, "variables">
): string | null {
  if (!isEphemeralTemplate(template.variables)) return null;
  const cfg = parseEphemeralCampaignConfig(template.variables);
  if (cfg?.status === "archived") return null;
  if (cfg?.status === "prepared") return "Campagne éphémère · file prête";
  return "Campagne éphémère";
}

export function computeTemplatesEmailPageStats(
  templates: TemplateEmail[],
  linkCountByTemplate: Map<number, number>
): {
  total: number;
  trigger: number;
  etiquette: number;
  relance: number;
  noChannel: number;
} {
  let trigger = 0;
  let etiquette = 0;
  let relance = 0;
  let noChannel = 0;

  for (const template of templates) {
    const flags = getTemplateActivationFlags(
      template,
      linkCountByTemplate.get(template.id) ?? 0
    );
    if (flags.hasTrigger) trigger += 1;
    if (flags.hasEtiquetteLink) etiquette += 1;
    if (flags.hasRelance) relance += 1;
    if (flags.isLibraryOnly) noChannel += 1;
  }

  return {
    total: templates.length,
    trigger,
    etiquette,
    relance,
    noChannel,
  };
}

export function matchesTemplateActivationStatFilter(
  template: TemplateEmail,
  linkCountByTemplate: Map<number, number>,
  filter: TemplateActivationStatFilter | null
): boolean {
  if (!filter) return true;
  const flags = getTemplateActivationFlags(
    template,
    linkCountByTemplate.get(template.id) ?? 0
  );
  switch (filter) {
    case "trigger":
      return flags.hasTrigger;
    case "etiquette":
      return flags.hasEtiquetteLink;
    case "relance":
      return flags.hasRelance;
    case "no_channel":
      return flags.isLibraryOnly;
    default:
      return true;
  }
}

export function getTemplateActivationPreviewHint(flags: TemplateActivationFlags): string {
  if (flags.hasTrigger && flags.hasEtiquetteLink) {
    return "Actif par déclencheur et lié à des étiquettes — vérifiez le risque de doublon sur les souscriptions.";
  }
  if (flags.hasTrigger) {
    return "Actif par déclencheur — les contacts éligibles apparaissent dans Suivi → Envois.";
  }
  if (flags.hasEtiquetteLink) {
    return "Lié à des étiquettes — envoi via campagne étiquette dans Suivi → Envois.";
  }
  return "Bibliothèque seule — activez un déclencheur ou liez une étiquette pour alimenter Suivi → Envois.";
}
