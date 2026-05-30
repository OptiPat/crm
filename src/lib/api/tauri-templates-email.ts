import { invoke } from "@tauri-apps/api/core";

export interface TemplateEmail {
  id: number;
  nom: string;
  sujet: string;
  corps: string;
  categorie: string;
  variables: string | null;
  agenda_link_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface NewTemplateEmail {
  nom: string;
  sujet: string;
  corps: string;
  categorie: string;
  variables?: string | null;
  agenda_link_id?: string | null;
}

export async function getAllTemplatesEmail(): Promise<TemplateEmail[]> {
  return invoke<TemplateEmail[]>("get_all_templates_email");
}

export async function createTemplateEmail(template: NewTemplateEmail): Promise<TemplateEmail> {
  return invoke<TemplateEmail>("create_template_email", { newTemplate: template });
}

export async function getTemplateEmailById(id: number): Promise<TemplateEmail> {
  return invoke<TemplateEmail>("get_template_email_by_id", { id });
}

export async function updateTemplateEmail(id: number, template: NewTemplateEmail): Promise<TemplateEmail> {
  return invoke<TemplateEmail>("update_template_email", { id, template });
}

export async function deleteTemplateEmail(id: number): Promise<void> {
  return invoke<void>("delete_template_email", { id });
}

export async function setTemplateEtiquetteLinks(
  templateId: number,
  etiquetteIds: number[]
): Promise<void> {
  return invoke<void>("set_template_etiquette_links", {
    input: { template_id: templateId, etiquette_ids: etiquetteIds },
  });
}

export async function getEtiquetteIdsForTemplate(templateId: number): Promise<number[]> {
  return invoke<number[]>("get_etiquette_ids_for_template", { templateId });
}

/** Modèles métier par défaut (idempotent : n'écrase pas les existants). */
export async function seedDefaultEmailTemplates(): Promise<number> {
  return invoke<number>("seed_default_email_templates");
}

// Fonction utilitaire pour remplacer les variables dans un template
export function replaceTemplateVariables(text: string, variables: Record<string, string>): string {
  let result = text;
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  });
  return result;
}
