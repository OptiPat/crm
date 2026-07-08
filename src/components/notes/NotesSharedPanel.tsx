import { useCallback, useEffect, useState } from "react";
import { MessageSquarePlus, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoteHtmlContent } from "@/components/notes/NoteHtmlContent";
import { NoteRichTextEditor } from "@/components/notes/NoteRichTextEditor";
import {
  addSharedNoteContribution,
  createSharedNote,
  deleteSharedNote,
  getSharedNotes,
  syncSharedNotes,
  updateSharedNote,
  type SharedNote,
} from "@/lib/api/tauri-notes";
import { notifyNotesChanged, subscribeNotesChanged } from "@/lib/notes/note-events";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const EMPTY = { title: "", content_html: "" };

function pickSelectedId(prev: string | null, rows: SharedNote[]): string | null {
  if (prev && rows.some((n) => n.id === prev)) return prev;
  return rows[0]?.id ?? null;
}

export function NotesSharedPanel() {
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editMode, setEditMode] = useState<"view" | "create" | "edit" | "contribute">("view");
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  const loadLocal = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getSharedNotes();
      setNotes(rows);
      setSelectedId((prev) => pickSelectedId(prev, rows));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const syncRemote = useCallback(async (showToast = false) => {
    setSyncing(true);
    try {
      const result = await syncSharedNotes();
      setNotes(result.notes);
      setSyncMessage(result.message ?? null);
      setSelectedId((prev) => pickSelectedId(prev, result.notes));
      if (showToast) {
        toast.success(result.synced ? "Bibliothèque synchronisée." : "Cache local affiché.");
      }
      notifyNotesChanged();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal]);

  useEffect(() => {
    return subscribeNotesChanged(() => {
      void loadLocal();
    });
  }, [loadLocal]);

  const startCreate = () => {
    setEditMode("create");
    setDraft(EMPTY);
    setSelectedId(null);
  };

  const startEdit = () => {
    if (!selected) return;
    setEditMode("edit");
    setDraft({ title: selected.title, content_html: selected.content_html });
  };

  const startContribute = () => {
    if (!selected) return;
    setEditMode("contribute");
    setDraft({ title: "", content_html: "" });
  };

  const cancelEdit = () => {
    setEditMode("view");
    setDraft(EMPTY);
  };

  const handleSave = async () => {
    if (editMode === "contribute") {
      if (!selected || !draft.content_html.trim()) {
        toast.error("Le complément ne peut pas être vide.");
        return;
      }
      setSaving(true);
      try {
        const updated = await addSharedNoteContribution({
          noteId: selected.id,
          contentHtml: draft.content_html,
        });
        setNotes(updated);
        setEditMode("view");
        notifyNotesChanged();
        toast.success("Complément publié.");
      } catch (error) {
        toast.error(String(error));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!draft.title.trim()) {
      toast.error("Le titre est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      const payload = { title: draft.title.trim(), contentHtml: draft.content_html };
      const updated =
        editMode === "create"
          ? await createSharedNote(payload)
          : selected
            ? await updateSharedNote(selected.id, payload)
            : [];
      setNotes(updated);
      if (updated[0]) setSelectedId(updated[0].id);
      setEditMode("view");
      notifyNotesChanged();
      toast.success(editMode === "create" ? "Note partagée publiée." : "Note mise à jour.");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected?.can_delete) return;
    setSaving(true);
    try {
      const updated = await deleteSharedNote(selected.id);
      setNotes(updated);
      setSelectedId(pickSelectedId(null, updated));
      setEditMode("view");
      notifyNotesChanged();
      toast.success("Note supprimée.");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={syncing} onClick={() => void syncRemote(true)}>
          <RefreshCw className={cn("h-4 w-4 mr-1.5", syncing && "animate-spin")} />
          Actualiser
        </Button>
        <Button size="sm" onClick={startCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Publier une note
        </Button>
        {syncMessage && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            {syncMessage}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-xl border bg-card p-3 max-h-[65vh] overflow-y-auto space-y-1">
          {loading ? (
            <p className="text-sm text-muted-foreground p-2">Chargement…</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">Aucune note partagée pour l&apos;instant.</p>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => {
                  setSelectedId(note.id);
                  setEditMode("view");
                }}
                className={cn(
                  "w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-muted/70",
                  selectedId === note.id && "bg-muted"
                )}
              >
                <span className="font-medium line-clamp-2">{note.title}</span>
                <span className="text-xs text-muted-foreground">{note.author_name}</span>
              </button>
            ))
          )}
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-4 min-h-[320px]">
          {editMode !== "view" ? (
            <>
              {editMode !== "contribute" && (
                <div className="space-y-2">
                  <Label htmlFor="shared-title">Titre</Label>
                  <Input
                    id="shared-title"
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                </div>
              )}
              {editMode === "contribute" && selected && (
                <p className="text-sm text-muted-foreground">
                  Complément à : <strong>{selected.title}</strong> (par {selected.author_name})
                </p>
              )}
              <NoteRichTextEditor
                value={draft.content_html}
                onChange={(html) => setDraft((d) => ({ ...d, content_html: html }))}
                placeholder={
                  editMode === "contribute"
                    ? "Ajoutez votre astuce ou correction…"
                    : "Contenu de la note partagée…"
                }
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={saving} onClick={() => void handleSave()}>
                  {editMode === "contribute" ? "Publier le complément" : "Enregistrer"}
                </Button>
                <Button variant="outline" disabled={saving} onClick={cancelEdit}>
                  Annuler
                </Button>
              </div>
            </>
          ) : selected ? (
            <>
              <div>
                <h2 className="text-lg font-semibold">{selected.title}</h2>
                <p className="text-sm text-muted-foreground">Par {selected.author_name}</p>
              </div>
              <NoteHtmlContent html={selected.content_html} />
              {selected.contributions.length > 0 && (
                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-semibold">Compléments de la communauté</h3>
                  {selected.contributions.map((c) => (
                    <div key={c.id} className="rounded-lg bg-muted/40 p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">{c.author_name}</p>
                      <NoteHtmlContent html={c.content_html} />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button size="sm" variant="outline" onClick={startContribute}>
                  <MessageSquarePlus className="h-4 w-4 mr-1.5" />
                  Enrichir
                </Button>
                {selected.can_edit && (
                  <Button size="sm" variant="outline" onClick={startEdit}>
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Modifier
                  </Button>
                )}
                {selected.can_delete && (
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => void handleDelete()}>
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Supprimer
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sélectionnez une note ou publiez-en une nouvelle pour la communauté.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
