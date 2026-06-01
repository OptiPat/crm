import { invoke } from "@tauri-apps/api/core";

export interface NewsletterSettings {
  apiKeyConfigured: boolean;
  stylePrompt: string;
  model: string;
  etiquetteNom: string;
  sendDelayMs: number;
}

export interface NewsletterSettingsInput {
  apiKey?: string | null;
  stylePrompt?: string | null;
  model?: string | null;
  etiquetteNom?: string | null;
  sendDelayMs?: number | null;
}

export interface GeneratedNewsletterSection {
  title: string;
  body: string;
}

export interface GeneratedNewsletterContent {
  subject: string;
  intro: string;
  sections: GeneratedNewsletterSection[];
  cta: string;
}

export interface EnsureNewsletterEtiquetteResult {
  etiquetteId: number;
  etiquetteNom: string;
  contactCount: number;
  created: boolean;
}

export async function getNewsletterSettings(): Promise<NewsletterSettings> {
  return invoke<NewsletterSettings>("get_newsletter_settings");
}

export async function saveNewsletterSettings(
  input: NewsletterSettingsInput
): Promise<NewsletterSettings> {
  return invoke<NewsletterSettings>("save_newsletter_settings", { input });
}

export async function generateNewsletterContent(input: {
  theme: string;
  editionInstructions?: string | null;
}): Promise<GeneratedNewsletterContent> {
  return invoke<GeneratedNewsletterContent>("generate_newsletter_content", { input });
}

export interface NewsletterChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function refineNewsletterContent(input: {
  current: GeneratedNewsletterContent;
  message: string;
  history?: NewsletterChatTurn[];
}): Promise<GeneratedNewsletterContent> {
  return invoke<GeneratedNewsletterContent>("refine_newsletter_content", { input });
}

export async function ensureNewsletterEtiquette(
  etiquetteNom?: string | null
): Promise<EnsureNewsletterEtiquetteResult> {
  return invoke<EnsureNewsletterEtiquetteResult>("ensure_newsletter_etiquette", {
    etiquetteNom: etiquetteNom ?? null,
  });
}

export async function activateNewsletterCampaign(
  etiquetteId: number,
  templateId: number
): Promise<void> {
  return invoke<void>("activate_newsletter_campaign", { etiquetteId, templateId });
}
