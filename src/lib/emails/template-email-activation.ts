import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import {
  isTemplateEmailRelanceEnabledForQueue,
  parseTemplateEmailRelance,
} from "@/lib/emails/template-email-relance";
import { parseTemplateEmailTrigger } from "@/lib/emails/template-email-trigger";
import {
  parseTemplateEmailPipeRdvTrigger,
  pipeRdvTriggerBadgeLabel,
} from "@/lib/emails/template-email-pipe-rdv";
import {
  parseTemplateEmailPlacementConformeTrigger,
  placementConformeTriggerBadgeLabel,
} from "@/lib/emails/template-email-placement-conforme";
import {
  formatTemplateEmailTriggerScheduleBadge,
} from "@/lib/emails/template-email-trigger-summary";
import { formatRuleTreeBrief } from "@/lib/etiquettes/etiquette-card-summary";
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
  hasPipeRdv: boolean;
  hasPlacementConforme: boolean;
  hasTutoiement: boolean;
  /** Au moins un canal de 1er envoi (déclencheur, étiquette ou Pipe RDV). */
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
  TMI: "TMI",
  IR_NET: "IR net",
  REVENUS_ANNUELS: "Revenus annuels",
  RULE_TREE: "Règle combinée",
};

function triggerTypeBadgeLabel(
  trigger: ReturnType<typeof parseTemplateEmailTrigger>
): string | null {
  const type = trigger.condition_type?.trim();
  if (!type) return null;
  if (type === "RULE_TREE") {
    return formatRuleTreeBrief(trigger.condition_config) ?? TRIGGER_SHORT_LABELS.RULE_TREE;
  }
  return (
    TRIGGER_SHORT_LABELS[type] ??
    type.replace(/_/g, " ").toLowerCase()
  );
}

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
  const pipeRdvTrigger = parseTemplateEmailPipeRdvTrigger(template.variables);
  const hasPipeRdv = pipeRdvTrigger.enabled && pipeRdvTrigger.stages.length > 0;
  const placementTrigger = parseTemplateEmailPlacementConformeTrigger(template.variables);
  const hasPlacementConforme =
    placementTrigger.enabled && placementTrigger.operation_types.length > 0;
  const hasTutoiement = template.tutoiement_template_id != null;
  const hasSendChannel = hasTrigger || hasEtiquetteLink || hasPipeRdv || hasPlacementConforme;

  return {
    hasTrigger,
    hasEtiquetteLink,
    hasRelance,
    hasPipeRdv,
    hasPlacementConforme,
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
  const typeLabel = triggerTypeBadgeLabel(trigger);
  if (!typeLabel) return null;
  const schedule = formatTemplateEmailTriggerScheduleBadge(trigger);
  return schedule ? `${typeLabel} · ${schedule}` : typeLabel;
}

export function getTemplatePipeRdvBadgeLabel(
  template: Pick<TemplateEmail, "variables">
): string | null {
  return pipeRdvTriggerBadgeLabel(template.variables);
}

export function getTemplatePlacementConformeBadgeLabel(
  template: Pick<TemplateEmail, "variables">
): string | null {
  return placementConformeTriggerBadgeLabel(template.variables);
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
  if (flags.hasPipeRdv) {
    return "Actif pour les RDV Pipe — envoi à la planification / replanification depuis le CRM.";
  }
  if (flags.hasPlacementConforme) {
    return "Actif pour Box Placement — envoi client quand une opération partenaire passe en conforme.";
  }
  return "Bibliothèque seule — activez un déclencheur ou liez une étiquette pour alimenter Suivi → Envois.";
}
