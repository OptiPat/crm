import type {
  GeneratedNewsletterContent,
  NewsletterAudienceFilters,
  NewsletterChatTurn,
} from "@/lib/api/tauri-newsletter";
import { DEFAULT_NEWSLETTER_AUDIENCE_FILTERS } from "@/lib/api/tauri-newsletter";

const STORAGE_KEY = "crm_newsletter_composer_draft";

export type NewsletterComposerTab = "composer" | "settings";

export interface NewsletterComposerDraft {
  tab: NewsletterComposerTab;
  theme: string;
  editionInstructions: string;
  content: GeneratedNewsletterContent | null;
  subject: string;
  plainBody: string;
  previewHtml: string;
  chatHistory: NewsletterChatTurn[];
  chatSessionKey: number;
  audienceFilters: NewsletterAudienceFilters;
  activeEditionId: number | null;
  preparedQueueCount: number | null;
  savedAt: number;
}

export function loadNewsletterComposerDraft(): NewsletterComposerDraft | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as Partial<NewsletterComposerDraft>;
    if (typeof parsed.savedAt !== "number") return null;
    return {
      tab: parsed.tab === "settings" ? "settings" : "composer",
      theme: typeof parsed.theme === "string" ? parsed.theme : "",
      editionInstructions:
        typeof parsed.editionInstructions === "string" ? parsed.editionInstructions : "",
      content: parseContent(parsed.content),
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      plainBody: typeof parsed.plainBody === "string" ? parsed.plainBody : "",
      previewHtml: typeof parsed.previewHtml === "string" ? parsed.previewHtml : "",
      chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : [],
      chatSessionKey:
        typeof parsed.chatSessionKey === "number" ? parsed.chatSessionKey : 0,
      audienceFilters: parseAudienceFilters(parsed.audienceFilters),
      activeEditionId:
        typeof parsed.activeEditionId === "number" ? parsed.activeEditionId : null,
      preparedQueueCount:
        typeof parsed.preparedQueueCount === "number" ? parsed.preparedQueueCount : null,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveNewsletterComposerDraft(
  draft: Omit<NewsletterComposerDraft, "savedAt">
): void {
  if (typeof sessionStorage === "undefined") return;
  const hasWork =
    draft.theme.trim() ||
    draft.editionInstructions.trim() ||
    draft.subject.trim() ||
    draft.plainBody.trim() ||
    draft.content ||
    draft.chatHistory.length > 0 ||
    draft.audienceFilters.excludeContactIds.length > 0 ||
    draft.activeEditionId != null ||
    draft.preparedQueueCount != null;
  if (!hasWork) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  const payload: NewsletterComposerDraft = {
    ...draft,
    savedAt: Date.now(),
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearNewsletterComposerDraft(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

function parseContent(value: unknown): GeneratedNewsletterContent | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Partial<GeneratedNewsletterContent>;
  if (typeof c.subject !== "string") return null;
  return {
    subject: c.subject,
    preheader: typeof c.preheader === "string" ? c.preheader : undefined,
    editionTitle: typeof c.editionTitle === "string" ? c.editionTitle : undefined,
    intro: typeof c.intro === "string" ? c.intro : "",
    sections: Array.isArray(c.sections)
      ? c.sections.map((s) => ({
          title: typeof s?.title === "string" ? s.title : "",
          body: typeof s?.body === "string" ? s.body : "",
          highlight: s?.highlight === true,
        }))
      : [],
    cta: typeof c.cta === "string" ? c.cta : "",
  };
}

function parseAudienceFilters(value: unknown): NewsletterAudienceFilters {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_NEWSLETTER_AUDIENCE_FILTERS };
  }
  const f = value as Partial<NewsletterAudienceFilters>;
  return {
    excludePrescripteurs: f.excludePrescripteurs === true,
    excludeSuspects: f.excludeSuspects === true,
    excludeArchived: f.excludeArchived === true,
    excludeContactIds: Array.isArray(f.excludeContactIds)
      ? f.excludeContactIds.filter((id): id is number => typeof id === "number")
      : [],
  };
}
