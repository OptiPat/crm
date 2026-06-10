import type {
  CancelNewsletterPreparationResult,
  GeneratedNewsletterContent,
  LastNewsletterEditionDuplicate,
  NewsletterAudienceFilters,
} from "@/lib/api/tauri-newsletter";
import { DEFAULT_NEWSLETTER_AUDIENCE_FILTERS } from "@/lib/api/tauri-newsletter";
import { contentFromPlainEdit } from "@/lib/newsletter/newsletter-html";
import type { NewsletterEditMode } from "@/lib/newsletter/newsletter-composer-draft";

export interface NewsletterComposerRestorePayload {
  theme: string;
  editionInstructions: string;
  content: GeneratedNewsletterContent | null;
  subject: string;
  plainBody: string;
  editMode: NewsletterEditMode;
  audienceFilters: NewsletterAudienceFilters;
}

export function parseNewsletterEditionContent(
  contentJson: string,
  subject: string,
  plainBody: string
): Pick<NewsletterComposerRestorePayload, "content" | "editMode"> {
  try {
    const parsed = JSON.parse(contentJson) as GeneratedNewsletterContent;
    return { content: parsed, editMode: "sections" };
  } catch {
    return {
      content: contentFromPlainEdit(subject, plainBody),
      editMode: "plain",
    };
  }
}

/** Extrait les filtres spécifiques à l'édition depuis les filtres fusionnés en base. */
export function editionAudienceFiltersFromStored(
  stored: NewsletterAudienceFilters,
  settings: NewsletterAudienceFilters
): NewsletterAudienceFilters {
  const settingsIds = new Set(settings.excludeContactIds);
  return {
    excludePrescripteurs:
      stored.excludePrescripteurs && !settings.excludePrescripteurs,
    excludeSuspects: stored.excludeSuspects && !settings.excludeSuspects,
    excludeArchived: stored.excludeArchived && !settings.excludeArchived,
    excludeContactIds: stored.excludeContactIds.filter(
      (id) => !settingsIds.has(id)
    ),
  };
}

type EditionRestoreSource =
  | CancelNewsletterPreparationResult
  | LastNewsletterEditionDuplicate
  | {
      subject: string;
      plainBody: string;
      contentJson: string;
      theme?: string | null;
      editionInstructions?: string | null;
      audienceFilters?: NewsletterAudienceFilters;
    };

export function buildComposerRestoreFromEdition(
  edition: EditionRestoreSource,
  settingsAudienceFilters: NewsletterAudienceFilters = DEFAULT_NEWSLETTER_AUDIENCE_FILTERS
): NewsletterComposerRestorePayload {
  const { content, editMode } = parseNewsletterEditionContent(
    edition.contentJson,
    edition.subject,
    edition.plainBody
  );

  const storedFilters =
    "audienceFilters" in edition ? edition.audienceFilters : undefined;

  return {
    theme: edition.theme?.trim() ?? "",
    editionInstructions: edition.editionInstructions?.trim() ?? "",
    content,
    subject: edition.subject,
    plainBody: edition.plainBody,
    editMode,
    audienceFilters: storedFilters
      ? editionAudienceFiltersFromStored(storedFilters, settingsAudienceFilters)
      : { ...DEFAULT_NEWSLETTER_AUDIENCE_FILTERS, excludeContactIds: [] },
  };
}
