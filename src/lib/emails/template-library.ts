import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import {
  isArchivedEphemeralTemplate,
  isEphemeralTemplate,
} from "@/lib/emails/template-email-ephemeral";
import {
  parseTemplateEmailPipeRdvFollowUp,
  parseTemplateEmailPipeRdvReminder,
} from "@/lib/emails/template-email-pipe-rdv";

/** Modèle enfant référencé par `relance_template_id` d’un autre — géré dans l’onglet Relance du parent. */
export function isRelanceChildTemplate(
  templateId: number,
  templates: TemplateEmail[]
): boolean {
  return templates.some((t) => t.relance_template_id === templateId);
}

/** Variante tutoiement liée (`tutoiement_template_id`) — gérée dans l’onglet Tutoiement du parent. */
export function isTutoiementChildTemplate(
  templateId: number,
  templates: TemplateEmail[]
): boolean {
  return templates.some((t) => t.tutoiement_template_id === templateId);
}

function pipeRdvLinkedTemplateIdsFromParent(template: TemplateEmail): number[] {
  const reminder = parseTemplateEmailPipeRdvReminder(template.variables);
  const followUp = parseTemplateEmailPipeRdvFollowUp(template.variables);
  return [
    reminder.reminder_template_id,
    reminder.reminder_tutoiement_template_id,
    followUp.follow_up_template_id,
    followUp.follow_up_tutoiement_template_id,
  ].filter((id): id is number => id != null && id > 0);
}

/** Rappel / suivi RDV Pipe dédiés (liés via meta JSON du parent). */
export function isPipeRdvChildTemplate(
  templateId: number,
  templates: TemplateEmail[]
): boolean {
  return templates.some((t) =>
    pipeRdvLinkedTemplateIdsFromParent(t).includes(templateId)
  );
}

export function findPipeRdvParentTemplate(
  childId: number,
  templates: TemplateEmail[]
): TemplateEmail | undefined {
  return templates.find((t) =>
    pipeRdvLinkedTemplateIdsFromParent(t).includes(childId)
  );
}

export function isLinkedChildTemplate(
  templateId: number,
  templates: TemplateEmail[]
): boolean {
  return (
    isRelanceChildTemplate(templateId, templates) ||
    isTutoiementChildTemplate(templateId, templates) ||
    isPipeRdvChildTemplate(templateId, templates)
  );
}

/** Variante tu orpheline d’une campagne éphémère (lien parent perdu à la sauvegarde). */
export function isOrphanEphemeralTuTemplate(
  template: TemplateEmail,
  templates: TemplateEmail[]
): boolean {
  if (isEphemeralTemplate(template.variables)) return false;
  if (isTutoiementChildTemplate(template.id, templates)) return false;
  if (!template.nom.trim().endsWith(" (tu)")) return false;
  const baseNom = template.nom.trim().slice(0, -" (tu)".length);
  return templates.some(
    (t) => t.nom.trim() === baseNom && isEphemeralTemplate(t.variables)
  );
}

export function isHiddenFromEmailLibrary(
  template: TemplateEmail,
  templates: TemplateEmail[]
): boolean {
  return (
    isArchivedEphemeralTemplate(template.variables) ||
    isLinkedChildTemplate(template.id, templates) ||
    isOrphanEphemeralTuTemplate(template, templates)
  );
}

export function filterLibraryTemplates(templates: TemplateEmail[]): TemplateEmail[] {
  return templates.filter((t) => !isHiddenFromEmailLibrary(t, templates));
}

/** Campagne étiquette : toujours le modèle parent (pas relance / tu / Pipe RDV lié). */
export function resolveCampaignTemplateId(
  templateId: number,
  templates: TemplateEmail[]
): number {
  if (!isLinkedChildTemplate(templateId, templates)) return templateId;
  const parent = templates.find(
    (t) =>
      t.tutoiement_template_id === templateId || t.relance_template_id === templateId
  );
  if (parent) return parent.id;
  return findPipeRdvParentTemplate(templateId, templates)?.id ?? templateId;
}
