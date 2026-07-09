import type { NotePrintDocument, NotePrintSection } from "@/lib/notes/note-print";
import { sanitizeNoteHtml } from "@/lib/notes/note-html";
import { formatNoteTimestamp } from "@/lib/notes/note-filter";
import type { SharedNote } from "@/lib/api/tauri-notes";

export function buildPersonalNotePrintDocument(input: {
  title: string;
  category: string;
  contentHtml: string;
}): NotePrintDocument | null {
  const title = input.title.trim();
  if (!title) return null;
  const subtitle = input.category.trim() || undefined;
  const content = sanitizeNoteHtml(input.contentHtml);
  return {
    title,
    subtitle,
    sections: [{ contentHtml: content }],
  };
}

export function buildSharedNotePrintDocument(note: SharedNote): NotePrintDocument {
  const sections: NotePrintSection[] = [
    { contentHtml: sanitizeNoteHtml(note.content_html) },
  ];
  for (const contribution of note.contributions) {
    sections.push({
      heading: "Complément de la communauté",
      meta: `${contribution.author_name} · ${formatNoteTimestamp(contribution.created_at)}`,
      contentHtml: sanitizeNoteHtml(contribution.content_html),
    });
  }
  return {
    title: note.title,
    subtitle: `Par ${note.author_name} · ${formatNoteTimestamp(note.updated_at)}`,
    sections,
  };
}
