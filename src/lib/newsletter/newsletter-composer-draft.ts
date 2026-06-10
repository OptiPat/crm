import type {
  GeneratedNewsletterContent,
  NewsletterAudienceFilters,
  NewsletterChatTurn,
  NewsletterPlacedImage,
  NewsletterRichBlock,
} from "@/lib/api/tauri-newsletter";
import { DEFAULT_NEWSLETTER_AUDIENCE_FILTERS } from "@/lib/api/tauri-newsletter";

const STORAGE_KEY = "crm_newsletter_composer_draft";

export type NewsletterComposerTab = "composer" | "settings";
export type NewsletterEditMode = "plain" | "sections";

export interface NewsletterComposerDraft {
  tab: NewsletterComposerTab;
  theme: string;
  editionInstructions: string;
  structurePresetId: string;
  editMode: NewsletterEditMode;
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

function readStorage(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

function writeStorage(value: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, value);
}

function removeStorage(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function loadNewsletterComposerDraft(): NewsletterComposerDraft | null {
  try {
    const raw = readStorage();
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as Partial<NewsletterComposerDraft>;
    if (typeof parsed.savedAt !== "number") return null;
    return {
      tab: parsed.tab === "settings" ? "settings" : "composer",
      theme: typeof parsed.theme === "string" ? parsed.theme : "",
      editionInstructions:
        typeof parsed.editionInstructions === "string" ? parsed.editionInstructions : "",
      structurePresetId:
        typeof parsed.structurePresetId === "string" ? parsed.structurePresetId : "libre",
      editMode: parsed.editMode === "sections" ? "sections" : "plain",
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
  const hasWork =
    draft.theme.trim() ||
    draft.editionInstructions.trim() ||
    draft.subject.trim() ||
    draft.plainBody.trim() ||
    draft.content ||
    draft.chatHistory.length > 0 ||
    draft.audienceFilters.excludeContactIds.length > 0 ||
    draft.audienceFilters.excludePrescripteurs ||
    draft.audienceFilters.excludeSuspects ||
    draft.audienceFilters.excludeArchived ||
    draft.activeEditionId != null ||
    draft.preparedQueueCount != null;
  if (!hasWork) {
    removeStorage();
    return;
  }
  const payload: NewsletterComposerDraft = {
    ...draft,
    savedAt: Date.now(),
  };
  writeStorage(JSON.stringify(payload));
}

export function clearNewsletterComposerDraft(): void {
  removeStorage();
}

function parseContent(value: unknown): GeneratedNewsletterContent | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Partial<GeneratedNewsletterContent>;
  if (typeof c.subject !== "string") return null;
  return {
    subject: c.subject,
    preheader: typeof c.preheader === "string" ? c.preheader : undefined,
    editionTitle: typeof c.editionTitle === "string" ? c.editionTitle : undefined,
    headerImageUrl: typeof c.headerImageUrl === "string" ? c.headerImageUrl : undefined,
    intro: typeof c.intro === "string" ? c.intro : "",
    sections: Array.isArray(c.sections)
      ? c.sections.map((s) => ({
          title: typeof s?.title === "string" ? s.title : "",
          body: typeof s?.body === "string" ? s.body : "",
          highlight: s?.highlight === true,
          imageUrl: typeof s?.imageUrl === "string" ? s.imageUrl : undefined,
        }))
      : [],
    cta: typeof c.cta === "string" ? c.cta : "",
    ctaLabel: typeof c.ctaLabel === "string" ? c.ctaLabel : undefined,
    ctaUrl: typeof c.ctaUrl === "string" ? c.ctaUrl : undefined,
    includeCta: c.includeCta === false ? false : undefined,
    includeConseiller: c.includeConseiller === false ? false : undefined,
    includeFooterPhone: c.includeFooterPhone === true ? true : undefined,
    includeFooterSite: c.includeFooterSite === true ? true : undefined,
    includeFooterAddress: c.includeFooterAddress === true ? true : undefined,
    conseillerName: typeof c.conseillerName === "string" ? c.conseillerName : undefined,
    conseillerPhone: typeof c.conseillerPhone === "string" ? c.conseillerPhone : undefined,
    layout:
      c.layout === "magazine" ||
      c.layout === "minimal" ||
      c.layout === "alert" ||
      c.layout === "single"
        ? c.layout
        : undefined,
    images: parsePlacedImages(c.images),
    blocks: parseRichBlocks(c.blocks),
  };
}

function parseRichBlocks(value: unknown): NewsletterRichBlock[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const parsed = value
    .map((item): NewsletterRichBlock | null => {
      if (!item || typeof item !== "object") return null;
      const block = item as Partial<NewsletterRichBlock>;
      if (typeof block.id !== "string" || typeof block.type !== "string") return null;
      if (
        block.type !== "quote" &&
        block.type !== "stat" &&
        block.type !== "takeaway" &&
        block.type !== "divider"
      ) {
        return null;
      }
      const placement = block.placement;
      if (!placement || typeof placement !== "object" || typeof placement.type !== "string") {
        return null;
      }
      return {
        id: block.id,
        type: block.type,
        placement: placement as NewsletterRichBlock["placement"],
        text: typeof block.text === "string" ? block.text : undefined,
        attribution: typeof block.attribution === "string" ? block.attribution : undefined,
        value: typeof block.value === "string" ? block.value : undefined,
        label: typeof block.label === "string" ? block.label : undefined,
        title: typeof block.title === "string" ? block.title : undefined,
      };
    })
    .filter((block): block is NewsletterRichBlock => block != null);
  return parsed.length > 0 ? parsed : undefined;
}

function parsePlacedImages(value: unknown): NewsletterPlacedImage[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const parsed = value
    .map((item): NewsletterPlacedImage | null => {
      if (!item || typeof item !== "object") return null;
      const img = item as Partial<NewsletterPlacedImage>;
      if (typeof img.id !== "string" || typeof img.dataUrl !== "string") return null;
      const placement = img.placement;
      if (!placement || typeof placement !== "object" || typeof placement.type !== "string") {
        return null;
      }
      return {
        id: img.id,
        dataUrl: img.dataUrl,
        placement: placement as NewsletterPlacedImage["placement"],
        alt: typeof img.alt === "string" ? img.alt : undefined,
      };
    })
    .filter((img): img is NewsletterPlacedImage => img != null);
  return parsed.length > 0 ? parsed : undefined;
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
