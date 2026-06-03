import { invoke } from "@tauri-apps/api/core";
import { notifyTemplatesEmailChanged } from "@/lib/emails/template-events";

export interface TemplateEmail {
  id: number;
  nom: string;
  sujet: string;
  corps: string;
  categorie: string;
  variables: string | null;
  agenda_link_id: string | null;
  relance_template_id: number | null;
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
  relance_template_id?: number | null;
}

export async function getAllTemplatesEmail(): Promise<TemplateEmail[]> {
  return invoke<TemplateEmail[]>("get_all_templates_email");
}

export async function createTemplateEmail(template: NewTemplateEmail): Promise<TemplateEmail> {
  const result = await invoke<TemplateEmail>("create_template_email", { newTemplate: template });
  notifyTemplatesEmailChanged();
  return result;
}

export async function getTemplateEmailById(id: number): Promise<TemplateEmail> {
  return invoke<TemplateEmail>("get_template_email_by_id", { id });
}

export async function updateTemplateEmail(id: number, template: NewTemplateEmail): Promise<TemplateEmail> {
  const result = await invoke<TemplateEmail>("update_template_email", { id, template });
  notifyTemplatesEmailChanged();
  return result;
}

export async function deleteTemplateEmail(id: number): Promise<void> {
  await invoke<void>("delete_template_email", { id });
  notifyTemplatesEmailChanged();
}

export async function setTemplateEtiquetteLinks(
  templateId: number,
  etiquetteIds: number[]
): Promise<void> {
  await invoke<void>("set_template_etiquette_links", {
    input: { template_id: templateId, etiquette_ids: etiquetteIds },
  });
  notifyTemplatesEmailChanged();
}

export async function getEtiquetteIdsForTemplate(templateId: number): Promise<number[]> {
  return invoke<number[]>("get_etiquette_ids_for_template", { templateId });
}

/** Modèles métier par défaut (idempotent : n'écrase pas les existants). */
export async function seedDefaultEmailTemplates(options?: {
  onlyIfEmpty?: boolean;
}): Promise<number> {
  return invoke<number>("seed_default_email_templates", {
    onlyIfEmpty: options?.onlyIfEmpty ?? false,
  });
}

import { normalizeBrokenAgendaTokens } from "@/lib/emails/agenda-links";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Fonction utilitaire pour remplacer les variables dans un template
export function replaceTemplateVariables(text: string, variables: Record<string, string>): string {
  let result = normalizeBrokenAgendaTokens(text);
  const keys = Object.keys(variables).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const regex = new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, "g");
    result = result.replace(regex, variables[key] ?? "");
  }
  return result;
}
