import { stripDateInscriptionFromNotes } from "@/lib/contacts/contact-form-utils";

/** Ligne seule qui ouvre une note : `[26/09/2026 19:35]`. */
const NOTE_HEADER_RE = /^\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})\]$/;

export type ContactNoteEntry = {
  /** `jj/mm/aaaa hh:mm`, ou null pour un texte antérieur au journal. */
  at: string | null;
  body: string;
};

/** Note affichée, avec son index dans l'ordre de stockage. */
export type ListedContactNote = ContactNoteEntry & { index: number };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Horodatage local affiché et stocké en tête de note. */
export function formatContactNoteStamp(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function stampToTime(at: string): number {
  const match = at.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!match) return 0;
  return new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1]),
    Number(match[4]),
    Number(match[5])
  ).getTime();
}

function cleanedNotes(notes?: string | null): string {
  return stripDateInscriptionFromNotes(notes) ?? "";
}

/**
 * Découpe le texte des notes.
 * Tout ce qui précède le premier horodatage reste une note sans date.
 */
export function parseContactNotesLog(notes?: string | null): ContactNoteEntry[] {
  const raw = cleanedNotes(notes);
  if (!raw) return [];

  const entries: ContactNoteEntry[] = [];
  let legacy: string[] = [];
  let current: { at: string; lines: string[] } | null = null;
  let seenHeader = false;

  for (const line of raw.split("\n")) {
    const header = line.match(NOTE_HEADER_RE);
    if (header) {
      if (!seenHeader) {
        const body = legacy.join("\n").trim();
        if (body) entries.push({ at: null, body });
        legacy = [];
      } else if (current) {
        const body = current.lines.join("\n").trim();
        if (body) entries.push({ at: current.at, body });
      }
      seenHeader = true;
      current = { at: header[1], lines: [] };
      continue;
    }
    if (!seenHeader) legacy.push(line);
    else current?.lines.push(line);
  }

  if (!seenHeader) {
    const body = legacy.join("\n").trim();
    return body ? [{ at: null, body }] : [];
  }
  if (current) {
    const body = current.lines.join("\n").trim();
    if (body) entries.push({ at: current.at, body });
  }
  return entries;
}

/** Notes horodatées de la plus récente à la plus ancienne, puis le texte sans date. */
export function listContactNotesNewestFirst(notes?: string | null): ListedContactNote[] {
  const entries = parseContactNotesLog(notes).map((entry, index) => ({ ...entry, index }));
  const stamped = entries
    .filter((entry) => entry.at != null)
    .sort((a, b) => {
      const byTime = stampToTime(b.at!) - stampToTime(a.at!);
      return byTime !== 0 ? byTime : b.index - a.index;
    });
  const legacy = entries.filter((entry) => entry.at == null);
  return [...stamped, ...legacy];
}

/** Reconstruit le texte stocké, dans l'ordre d'origine. */
export function serializeContactNotesLog(entries: ContactNoteEntry[]): string {
  return entries
    .map((entry) => {
      const body = entry.body.trim();
      if (!body) return "";
      return entry.at ? `[${entry.at}]\n${body}` : body;
    })
    .filter(Boolean)
    .join("\n\n");
}

function replaceEntry(
  notes: string | null | undefined,
  index: number,
  next: ContactNoteEntry | null
): string {
  const entries = parseContactNotesLog(notes);
  if (index < 0 || index >= entries.length) return cleanedNotes(notes).trim();
  if (next) entries[index] = next;
  else entries.splice(index, 1);
  return serializeContactNotesLog(entries);
}

/** Remplace le texte d'une note. L'horodatage d'origine est conservé. */
export function updateContactNote(
  notes: string | null | undefined,
  index: number,
  body: string
): string {
  const entries = parseContactNotesLog(notes);
  const current = entries[index];
  const text = body.trim();
  if (!current || !text) return cleanedNotes(notes).trim();
  return replaceEntry(notes, index, { at: current.at, body: text });
}

/** Retire une note du journal. */
export function deleteContactNote(notes: string | null | undefined, index: number): string {
  return replaceEntry(notes, index, null);
}

/** Ajoute une note en fin de texte, avec l'heure locale de l'ajout. */
export function appendContactNote(
  notes: string | null | undefined,
  body: string,
  at: Date = new Date()
): string {
  const text = body.trim();
  const base = cleanedNotes(notes).trim();
  if (!text) return base;
  const block = `[${formatContactNoteStamp(at)}]\n${text}`;
  return base ? `${base}\n\n${block}` : block;
}
