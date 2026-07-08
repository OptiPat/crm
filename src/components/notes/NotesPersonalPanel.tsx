import { useCallback, useEffect, useState } from "react";
import { Plus, Pin, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NoteRichTextEditor } from "@/components/notes/NoteRichTextEditor";
import {
  createPersonalNote,
  deletePersonalNote,
  getAllPersonalNotes,
  updatePersonalNote,
  type PersonalNote,
} from "@/lib/api/tauri-notes";
import { notifyNotesChanged, subscribeNotesChanged } from "@/lib/notes/note-events";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const EMPTY_DRAFT = { title: "", content_html: "", category: "", pinned: false };

function draftFromNote(note: PersonalNote) {
  return {
    title: note.title,
    content_html: note.content_html,
    category: note.category ?? "",
    pinned: note.pinned,
  };
}

export function NotesPersonalPanel() {
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getAllPersonalNotes();
      setNotes(rows);
      setSelectedId((prev) => {
        const nextId =
          prev != null && rows.some((n) => n.id === prev) ? prev : (rows[0]?.id ?? null);
        const note = nextId != null ? rows.find((n) => n.id === nextId) : undefined;
        setDraft(note ? draftFromNote(note) : EMPTY_DRAFT);
        return nextId;
      });
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeNotesChanged(() => {
      void load();
    });
  }, [load]);

  const selectNote = (note: PersonalNote) => {
    setSelectedId(note.id);
    setDraft(draftFromNote(note));
  };

  const handleNew = () => {
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
  };

  const handleSave = async () => {
    if (!draft.title.trim()) {
      toast.error("Le titre est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        content_html: draft.content_html,
        category: draft.category.trim() || null,
        pinned: draft.pinned,
      };
      if (selectedId == null) {
        const created = await createPersonalNote(payload);
        setSelectedId(created.id);
        setDraft(draftFromNote(created));
      } else {
        const updated = await updatePersonalNote(selectedId, payload);
        setDraft(draftFromNote(updated));
      }
      notifyNotesChanged();
      await load();
      toast.success("Note enregistrée.");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (selectedId == null) return;
    setSaving(true);
    try {
      await deletePersonalNote(selectedId);
      notifyNotesChanged();
      setSelectedId(null);
      setDraft(EMPTY_DRAFT);
      await load();
      toast.success("Note supprimée.");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="rounded-xl border bg-card p-3 space-y-2">
        <Button size="sm" className="w-full" onClick={handleNew}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouvelle note
        </Button>
        {loading ? (
          <p className="text-sm text-muted-foreground p-2">Chargement…</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground p-2">Aucune note personnelle.</p>
        ) : (
          <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => selectNote(note)}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-muted/70",
                    selectedId === note.id && "bg-muted"
                  )}
                >
                  <span className="font-medium line-clamp-1 flex items-center gap-1">
                    {note.pinned && <Pin className="h-3 w-3 shrink-0" />}
                    {note.title}
                  </span>
                  {note.category && (
                    <span className="text-xs text-muted-foreground">{note.category}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="note-title">Titre</Label>
            <Input
              id="note-title"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Ex. Process import contacts"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-category">Catégorie</Label>
            <Input
              id="note-category"
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              placeholder="Process, Email…"
            />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Checkbox
              id="note-pinned"
              checked={draft.pinned}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, pinned: v === true }))}
            />
            <Label htmlFor="note-pinned" className="font-normal">
              Épingler
            </Label>
          </div>
        </div>

        <NoteRichTextEditor
          value={draft.content_html}
          onChange={(html) => setDraft((d) => ({ ...d, content_html: html }))}
          minHeight="320px"
        />

        <div className="flex flex-wrap gap-2">
          <Button disabled={saving} onClick={() => void handleSave()}>
            <Save className="h-4 w-4 mr-1.5" />
            Enregistrer
          </Button>
          {selectedId != null && (
            <Button variant="outline" disabled={saving} onClick={() => void handleDelete()}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              Supprimer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
