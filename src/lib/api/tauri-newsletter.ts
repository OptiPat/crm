import { invoke } from "@tauri-apps/api/core";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";

export interface NewsletterAudienceFilters {
  excludePrescripteurs: boolean;
  excludeSuspects: boolean;
  excludeArchived: boolean;
  excludeContactIds: number[];
}

export const DEFAULT_NEWSLETTER_AUDIENCE_FILTERS: NewsletterAudienceFilters = {
  excludePrescripteurs: false,
  excludeSuspects: false,
  excludeArchived: false,
  excludeContactIds: [],
};

export interface NewsletterAudienceMember {
  contactId: number;
  nom: string;
  prenom: string;
  email?: string | null;
  categorie: string;
  filleulCategorie?: string | null;
  hasEmail: boolean;
  unsubscribed: boolean;
}

export interface NewsletterEligibleContact {
  contactId: number;
  nom: string;
  prenom: string;
  email: string;
  categorie: string;
  filleulCategorie?: string | null;
}

export interface NewsletterAudiencePreview {
  totalContacts: number;
  withEmail: number;
  withoutEmail: number;
  permanentExcluded: number;
  excludedByFilters: number;
  eligible: number;
  recipients: NewsletterEligibleContact[];
}

export interface NewsletterUnsubscribedContact {
  contactId: number;
  nom: string;
  prenom: string;
  email?: string | null;
  unsubscribedAt: number;
  source?: string | null;
}

export interface PrepareNewsletterEditionResult {
  queued: number;
  skippedNoEmail: number;
  etiquetteId: number;
  editionId: number;
  templateId: number;
}

export interface NewsletterEditionSummary {
  id: number;
  editionLabel: string;
  subject: string;
  preparedAt: number;
  sendCompletedAt?: number | null;
  queuedCount: number;
  sentCount: number;
  errorCount: number;
  status: string;
}

export interface NewsletterEditionRecipient {
  contactId: number;
  contactEtiquetteId: number;
  nom: string;
  prenom: string;
  email: string;
  sentAt?: number | null;
  errorMessage?: string | null;
}

export interface NewsletterEditionDetail {
  id: number;
  editionLabel: string;
  subject: string;
  plainBody: string;
  theme?: string | null;
  editionInstructions?: string | null;
  preparedAt: number;
  sendStartedAt?: number | null;
  sendCompletedAt?: number | null;
  queuedCount: number;
  sentCount: number;
  errorCount: number;
  status: string;
  recipients: NewsletterEditionRecipient[];
}

export interface LastNewsletterEditionDuplicate {
  editionLabel: string;
  subject: string;
  plainBody: string;
  contentJson: string;
  theme?: string | null;
  editionInstructions?: string | null;
  preparedAt: number;
}

export interface NewsletterSettings {
  apiKeyConfigured: boolean;
  stylePrompt: string;
  model: string;
  etiquetteNom: string;
  sendDelayMs: number;
  defaultAudienceFilters: NewsletterAudienceFilters;
}

export interface NewsletterSettingsInput {
  apiKey?: string | null;
  stylePrompt?: string | null;
  model?: string | null;
  etiquetteNom?: string | null;
  sendDelayMs?: number | null;
  defaultAudienceFilters?: NewsletterAudienceFilters | null;
}

export interface GeneratedNewsletterSection {
  title: string;
  body: string;
  highlight?: boolean;
}

export interface GeneratedNewsletterContent {
  subject: string;
  preheader?: string;
  editionTitle?: string;
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

/** @deprecated Préférer prepareNewsletterEdition */
export async function activateNewsletterCampaign(
  etiquetteId: number,
  templateId: number
): Promise<void> {
  return invoke<void>("activate_newsletter_campaign", { etiquetteId, templateId });
}

export async function getNewsletterAudienceMembers(): Promise<NewsletterAudienceMember[]> {
  return invoke<NewsletterAudienceMember[]>("get_newsletter_audience_members");
}

export async function getNewsletterAudiencePreview(
  filters: NewsletterAudienceFilters
): Promise<NewsletterAudiencePreview> {
  return invoke<NewsletterAudiencePreview>("get_newsletter_audience_preview", { filters });
}

export async function getNewsletterUnsubscribed(): Promise<NewsletterUnsubscribedContact[]> {
  return invoke<NewsletterUnsubscribedContact[]>("get_newsletter_unsubscribed");
}

export async function prepareNewsletterEdition(input: {
  etiquetteId: number;
  editionLabel: string;
  subject: string;
  plainBody: string;
  contentJson: string;
  htmlMeta: string;
  theme?: string | null;
  editionInstructions?: string | null;
  filters: NewsletterAudienceFilters;
}): Promise<PrepareNewsletterEditionResult> {
  const result = await invoke<PrepareNewsletterEditionResult>("prepare_newsletter_edition", { input });
  notifyRelationChanged(undefined, { skipEtiquettesChanged: true });
  return result;
}

export async function listNewsletterEditions(
  limit?: number
): Promise<NewsletterEditionSummary[]> {
  return invoke<NewsletterEditionSummary[]>("list_newsletter_editions", { limit: limit ?? null });
}

export async function getNewsletterEditionDetail(
  editionId: number
): Promise<NewsletterEditionDetail> {
  return invoke<NewsletterEditionDetail>("get_newsletter_edition_detail", { editionId });
}

export async function getLastNewsletterEditionDuplicate(): Promise<LastNewsletterEditionDuplicate | null> {
  return invoke<LastNewsletterEditionDuplicate | null>("get_last_newsletter_edition_duplicate");
}

export async function startNewsletterEditionSend(editionId: number): Promise<void> {
  return invoke<void>("start_newsletter_edition_send", { editionId });
}

export async function recordNewsletterEditionSend(input: {
  editionId: number;
  contactEtiquetteId: number;
  gmailMessageId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  return invoke<void>("record_newsletter_edition_send", { input });
}

export async function finishNewsletterEditionSend(input: {
  editionId: number;
  cancelled: boolean;
}): Promise<NewsletterEditionSummary> {
  return invoke<NewsletterEditionSummary>("finish_newsletter_edition_send", {
    editionId: input.editionId,
    cancelled: input.cancelled,
  });
}

