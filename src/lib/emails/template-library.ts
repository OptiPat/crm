import type { TemplateEmail } from "@/lib/api/tauri-templates-email";

/** Modèle enfant référencé par `relance_template_id` d’un autre — géré dans l’onglet Relance du parent. */
export function isRelanceChildTemplate(
  templateId: number,
  templates: TemplateEmail[]
): boolean {
  return templates.some((t) => t.relance_template_id === templateId);
}

export function filterLibraryTemplates(templates: TemplateEmail[]): TemplateEmail[] {
  return templates.filter((t) => !isRelanceChildTemplate(t.id, templates));
}
