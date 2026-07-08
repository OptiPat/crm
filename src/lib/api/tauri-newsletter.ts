import { invoke } from "@tauri-apps/api/core";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
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
  statutSuivi?: string | null;
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

export interface CancelNewsletterPreparationResult {
  editionId: number;
  cancelledQueueCount: number;
  editionLabel: string;
  subject: string;
  plainBody: string;
  contentJson: string;
  theme?: string | null;
  editionInstructions?: string | null;
  audienceFilters: NewsletterAudienceFilters;
}

export type NewsletterLayout = "magazine" | "minimal" | "alert" | "single";

export type NewsletterImagePlacement =
  | { type: "header" }
  | { type: "after_intro" }
  | { type: "before_cta" }
  | { type: "before_section"; index: number }
  | { type: "after_section"; index: number };

export interface NewsletterPlacedImage {
  id: string;
  dataUrl: string;
  placement: NewsletterImagePlacement;
  alt?: string;
}

export type NewsletterRichBlockType = "quote" | "stat" | "takeaway" | "divider";

export interface NewsletterRichBlock {
  id: string;
  type: NewsletterRichBlockType;
  placement: NewsletterImagePlacement;
  /** Citation ou encart à retenir */
  text?: string;
  attribution?: string;
  /** Chiffre clé */
  value?: string;
  label?: string;
  /** Titre encart (défaut : À retenir) */
  title?: string;
}

export type NewsletterBodyFont = "classic" | "modern" | "system";
export type NewsletterTitleFont = "classic" | "modern";
export type NewsletterBodyFontSize = "sm" | "md" | "lg";
export type NewsletterLineHeight = "normal" | "relaxed";
export type NewsletterSectionSpacing = "compact" | "normal" | "airy";

export interface NewsletterSettings {
  apiKeyConfigured: boolean;
  stylePrompt: string;
  model: string;
  etiquetteNom: string;
  sendDelayMs: number;
  accentColor?: string | null;
  secondaryColor?: string | null;
  defaultLayout?: NewsletterLayout | null;
  bodyFont?: NewsletterBodyFont | null;
  titleFont?: NewsletterTitleFont | null;
  bodyFontSize?: NewsletterBodyFontSize | null;
  lineHeight?: NewsletterLineHeight | null;
  sectionSpacing?: NewsletterSectionSpacing | null;
  /** Identifiant du lien agenda (Paramètres → Agenda & RDV) pour le bouton RDV newsletter. */
  agendaLinkId?: string | null;
  defaultAudienceFilters: NewsletterAudienceFilters;
}

export interface NewsletterSettingsInput {
  apiKey?: string | null;
  stylePrompt?: string | null;
  model?: string | null;
  etiquetteNom?: string | null;
  sendDelayMs?: number | null;
  accentColor?: string | null;
  secondaryColor?: string | null;
  defaultLayout?: NewsletterLayout | null;
  bodyFont?: NewsletterBodyFont | null;
  titleFont?: NewsletterTitleFont | null;
  bodyFontSize?: NewsletterBodyFontSize | null;
  lineHeight?: NewsletterLineHeight | null;
  sectionSpacing?: NewsletterSectionSpacing | null;
  agendaLinkId?: string | null;
  defaultAudienceFilters?: NewsletterAudienceFilters | null;
}

export interface GeneratedNewsletterSection {
  title: string;
  body: string;
  highlight?: boolean;
  imageUrl?: string;
}

export interface GeneratedNewsletterContent {
  subject: string;
  preheader?: string;
  editionTitle?: string;
  /** @deprecated Préférer images[] */
  headerImageUrl?: string;
  layout?: NewsletterLayout;
  images?: NewsletterPlacedImage[];
  blocks?: NewsletterRichBlock[];
  intro: string;
  sections: GeneratedNewsletterSection[];
  cta: string;
  /** Libellé du bouton CTA (optionnel) */
  ctaLabel?: string;
  /** URL du bouton CTA (optionnel — fusion agenda si texte RDV) */
  ctaUrl?: string;
  /** false = pas de bloc CTA dans le mail */
  includeCta?: boolean;
  /** false = pas de bloc « Votre conseiller » */
  includeConseiller?: boolean;
  /** true = téléphone profil CGP dans le pied de page */
  includeFooterPhone?: boolean;
  /** true = site web profil CGP dans le pied de page */
  includeFooterSite?: boolean;
  /** true = adresse postale profil CGP dans le pied de page */
  includeFooterAddress?: boolean;
  conseillerName?: string;
  conseillerPhone?: string;
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

export async function cancelNewsletterPreparation(input: {
  etiquetteId: number;
  editionId?: number | null;
}): Promise<CancelNewsletterPreparationResult> {
  const result = await invoke<CancelNewsletterPreparationResult>(
    "cancel_newsletter_preparation",
    {
      etiquetteId: input.etiquetteId,
      editionId: input.editionId ?? null,
    }
  );
  notifyRelationChanged(undefined, { skipEtiquettesChanged: true });
  return result;
}

export async function getNewsletterSendQueue(
  editionId: number
): Promise<EtiquetteEmailQueueItem[]> {
  return invoke<EtiquetteEmailQueueItem[]>("get_newsletter_send_queue", { editionId });
}

export async function countNewsletterSendReady(
  etiquetteId: number,
  editionId?: number | null
): Promise<number> {
  return invoke<number>("count_newsletter_send_ready", {
    etiquetteId,
    editionId: editionId ?? null,
  });
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

