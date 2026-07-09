import type { PersonalNote, SharedNote } from "@/lib/api/tauri-notes";
import { sanitizeNoteHtml } from "@/lib/notes/note-html";
import { textMatchesSearch } from "@/lib/search-utils";

export type PersonalNoteDraft = {
  title: string;
  content_html: string;
  category: string;
  pinned: boolean;
};

export const EMPTY_PERSONAL_DRAFT: PersonalNoteDraft = {
  title: "",
  content_html: "",
  category: "",
  pinned: false,
};

function normalizeDraftHtml(html: string): string {
  return sanitizeNoteHtml(html);
}

export function draftFromPersonalNote(note: PersonalNote): PersonalNoteDraft {
  return {
    title: note.title,
    content_html: normalizeDraftHtml(note.content_html),
    category: note.category ?? "",
    pinned: note.pinned,
  };
}

export function personalNoteDraftsEqual(a: PersonalNoteDraft, b: PersonalNoteDraft): boolean {
  return (
    a.title === b.title &&
    normalizeDraftHtml(a.content_html) === normalizeDraftHtml(b.content_html) &&
    a.category === b.category &&
    a.pinned === b.pinned
  );
}

export function isPersonalNoteDraftDirty(
  draft: PersonalNoteDraft,
  baseline: PersonalNoteDraft
): boolean {
  return !personalNoteDraftsEqual(draft, baseline);
}

function stripHtmlForSearch(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function uniquePersonalNoteCategories(notes: PersonalNote[]): string[] {
  const set = new Set<string>();
  for (const note of notes) {
    const cat = note.category?.trim();
    if (cat) set.add(cat);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
}

export function filterPersonalNotes(
  notes: PersonalNote[],
  query: string,
  category: string
): PersonalNote[] {
  let list = notes;
  if (category !== "all") {
    list = list.filter((n) => (n.category ?? "").trim() === category);
  }
  const q = query.trim();
  if (!q) return list;
  return list.filter((n) =>
    textMatchesSearch(
      q,
      n.title,
      n.category,
      stripHtmlForSearch(n.content_html)
    )
  );
}

export function filterSharedNotes(notes: SharedNote[], query: string): SharedNote[] {
  const q = query.trim();
  if (!q) return notes;
  return notes.filter((n) =>
    textMatchesSearch(
      q,
      n.title,
      n.author_name,
      stripHtmlForSearch(n.content_html),
      ...n.contributions.map((c) => c.author_name),
      ...n.contributions.map((c) => stripHtmlForSearch(c.content_html))
    )
  );
}

/** Date absolue locale, ex. « le 01/07/2026 ». */
export function formatNoteTimestamp(ts: number): string {
  const date = new Date(ts * 1000);
  const formatted = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `le ${formatted}`;
}
