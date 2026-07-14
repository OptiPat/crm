import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { getTemplateCorpsHtml } from "@/lib/emails/template-email-html";
import type { TemplateActivationFlags } from "@/lib/emails/template-email-activation";
import {
  formatTemplateRelanceScheduleSummary,
  DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS,
  parseTemplateEmailRelance,
} from "@/lib/emails/template-email-relance";
import {
  parseTemplateEmailPipeRdvFollowUp,
  parseTemplateEmailPipeRdvReminder,
} from "@/lib/emails/template-email-pipe-rdv";

export type TemplateLinkedPreviewSection = {
  id: string;
  label: string;
  sujet: string;
  corps: string;
  corpsHtml: string | null;
  templateVariables: string | null;
  templateNom: string;
  agendaLinkId: string | null;
  tutoiement: {
    sujet: string;
    corps: string;
    corpsHtml: string | null;
    variables: string | null;
  } | null;
};

function findTemplate(
  allTemplates: TemplateEmail[],
  id: number | null | undefined
): TemplateEmail | undefined {
  if (id == null || id <= 0) return undefined;
  return allTemplates.find((t) => t.id === id);
}

function tutoiementFromTemplate(
  template: TemplateEmail,
  allTemplates: TemplateEmail[],
  tutoiementId: number | null | undefined
): TemplateLinkedPreviewSection["tutoiement"] {
  const tuId = tutoiementId ?? template.tutoiement_template_id;
  const tu = findTemplate(allTemplates, tuId);
  if (!tu) return null;
  return {
    sujet: tu.sujet,
    corps: tu.corps,
    corpsHtml: getTemplateCorpsHtml(tu.variables),
    variables: tu.variables,
  };
}

function sectionFromTemplate(
  template: TemplateEmail,
  allTemplates: TemplateEmail[],
  id: string,
  label: string,
  tutoiementId?: number | null
): TemplateLinkedPreviewSection {
  return {
    id,
    label,
    sujet: template.sujet,
    corps: template.corps,
    corpsHtml: getTemplateCorpsHtml(template.variables),
    templateVariables: template.variables,
    templateNom: template.nom,
    agendaLinkId: template.agenda_link_id,
    tutoiement: tutoiementFromTemplate(template, allTemplates, tutoiementId),
  };
}

/** Aperçus des modèles liés (relance / Pipe RDV) — uniquement si message dédié configuré. */
export function buildTemplateLinkedPreviewSections(
  parent: TemplateEmail,
  allTemplates: TemplateEmail[],
  flags: TemplateActivationFlags
): TemplateLinkedPreviewSection[] {
  const sections: TemplateLinkedPreviewSection[] = [];

  if (flags.hasRelance && parent.relance_template_id != null) {
    const relanceTpl = findTemplate(allTemplates, parent.relance_template_id);
    if (relanceTpl) {
      const relanceCfg = parseTemplateEmailRelance(parent.variables);
      const schedule = formatTemplateRelanceScheduleSummary(
        relanceCfg,
        DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS
      );
      sections.push(
        sectionFromTemplate(
          relanceTpl,
          allTemplates,
          "relance",
          schedule ? `Relance · ${schedule}` : "Relance"
        )
      );
    }
  }

  if (flags.hasPipeRdv) {
    const reminder = parseTemplateEmailPipeRdvReminder(parent.variables);
    if (
      reminder.enabled &&
      !reminder.use_same_message &&
      reminder.reminder_template_id != null
    ) {
      const reminderTpl = findTemplate(allTemplates, reminder.reminder_template_id);
      if (reminderTpl) {
        const heures = reminder.delai_heures;
        sections.push(
          sectionFromTemplate(
            reminderTpl,
            allTemplates,
            "pipe-rdv-reminder",
            `Pipe RDV — Rappel (J-${heures}h)`,
            reminder.reminder_tutoiement_template_id
          )
        );
      }
    }

    const followUp = parseTemplateEmailPipeRdvFollowUp(parent.variables);
    if (
      followUp.enabled &&
      !followUp.use_same_message &&
      followUp.follow_up_template_id != null
    ) {
      const followUpTpl = findTemplate(allTemplates, followUp.follow_up_template_id);
      if (followUpTpl) {
        const heures = followUp.delai_heures;
        sections.push(
          sectionFromTemplate(
            followUpTpl,
            allTemplates,
            "pipe-rdv-follow-up",
            `Pipe RDV — Suivi (J+${heures}h)`,
            followUp.follow_up_tutoiement_template_id
          )
        );
      }
    }
  }

  return sections;
}
