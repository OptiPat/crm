import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { isArchivedEphemeralTemplate } from "@/lib/emails/template-email-ephemeral";

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

export function isLinkedChildTemplate(
  templateId: number,
  templates: TemplateEmail[]
): boolean {
  return (
    isRelanceChildTemplate(templateId, templates) ||
    isTutoiementChildTemplate(templateId, templates)
  );
}

export function filterLibraryTemplates(templates: TemplateEmail[]): TemplateEmail[] {
  return templates.filter(
    (t) =>
      !isLinkedChildTemplate(t.id, templates) &&
      !isArchivedEphemeralTemplate(t.variables)
  );
}

/** Campagne étiquette : toujours le modèle parent (pas relance / tu lié). */
export function resolveCampaignTemplateId(
  templateId: number,
  templates: TemplateEmail[]
): number {
  if (!isLinkedChildTemplate(templateId, templates)) return templateId;
  const parent = templates.find(
    (t) =>
      t.tutoiement_template_id === templateId || t.relance_template_id === templateId
  );
  return parent?.id ?? templateId;
}
