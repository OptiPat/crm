import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pin, Trash2, Save, Search, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NoteRichTextEditor } from "@/components/notes/NoteRichTextEditor";
import {
  createPersonalNote,
  deletePersonalNote,
  getAllPersonalNotes,
  updatePersonalNote,
  type PersonalNote,
} from "@/lib/api/tauri-notes";
import { notifyNotesChanged, subscribeNotesChanged } from "@/lib/notes/note-events";
import {
  draftFromPersonalNote,
  EMPTY_PERSONAL_DRAFT,
  filterPersonalNotes,
  formatNoteTimestamp,
  isPersonalNoteDraftDirty,
  uniquePersonalNoteCategories,
  type PersonalNoteDraft,
} from "@/lib/notes/note-filter";
import { sanitizeNoteHtml } from "@/lib/notes/note-html";
import { buildPersonalNotePrintDocument } from "@/lib/notes/note-print-document";
import { useNotePrint } from "@/components/notes/NotePrintProvider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PendingAction =
  | { type: "select"; note: PersonalNote }
  | { type: "new" };

export function NotesPersonalPanel() {
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<PersonalNoteDraft>(EMPTY_PERSONAL_DRAFT);
  const [baseline, setBaseline] = useState<PersonalNoteDraft>(EMPTY_PERSONAL_DRAFT);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [editorResetToken, setEditorResetToken] = useState(0);
  const isDirtyRef = useRef(false);
  const { printDocument, isPrinting } = useNotePrint();

  const isDirty = useMemo(() => isPersonalNoteDraftDirty(draft, baseline), [draft, baseline]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const categories = useMemo(() => uniquePersonalNoteCategories(notes), [notes]);

  const filteredNotes = useMemo(
    () => filterPersonalNotes(notes, searchQuery, categoryFilter),
    [notes, searchQuery, categoryFilter]
  );

  const selectedNote = selectedId != null ? notes.find((n) => n.id === selectedId) : null;

  const applySelection = useCallback((note: PersonalNote | null) => {
    if (note) {
      const next = draftFromPersonalNote(note);
      setSelectedId(note.id);
      setDraft(next);
      setBaseline(next);
    } else {
      setSelectedId(null);
      setDraft(EMPTY_PERSONAL_DRAFT);
      setBaseline(EMPTY_PERSONAL_DRAFT);
    }
  }, []);

  const applyNoteRows = useCallback((rows: PersonalNote[], preserveDraft: boolean) => {
    setNotes(rows);
    if (preserveDraft) return;
    setSelectedId((prev) => {
      const nextId =
        prev != null && rows.some((n) => n.id === prev) ? prev : (rows[0]?.id ?? null);
      const note = nextId != null ? rows.find((n) => n.id === nextId) : undefined;
      const nextDraft = note ? draftFromPersonalNote(note) : EMPTY_PERSONAL_DRAFT;
      setDraft(nextDraft);
      setBaseline(nextDraft);
      return nextId;
    });
  }, []);

  const load = useCallback(async (options?: { preserveDraft?: boolean }) => {
    setLoading(true);
    try {
      const rows = await getAllPersonalNotes();
      applyNoteRows(rows, options?.preserveDraft ?? false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, [applyNoteRows]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeNotesChanged(() => {
      void load({ preserveDraft: isDirtyRef.current });
    });
  }, [load]);

  const requestAction = (action: PendingAction) => {
    if (isDirty) {
      setPendingAction(action);
      setShowDiscardDialog(true);
      return;
    }
    if (action.type === "select") {
      applySelection(action.note);
    } else {
      applySelection(null);
    }
  };

  const confirmDiscard = () => {
    if (!pendingAction) return;
    if (pendingAction.type === "select") {
      applySelection(pendingAction.note);
    } else {
      applySelection(null);
    }
    setPendingAction(null);
    setShowDiscardDialog(false);
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
        content_html: sanitizeNoteHtml(draft.content_html),
        category: draft.category.trim() || null,
        pinned: draft.pinned,
      };
      if (selectedId == null) {
        const created = await createPersonalNote(payload);
        const next = draftFromPersonalNote(created);
        setSelectedId(created.id);
        setDraft(next);
        setBaseline(next);
      } else {
        const updated = await updatePersonalNote(selectedId, payload);
        const next = draftFromPersonalNote(updated);
        setDraft(next);
        setBaseline(next);
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
      applySelection(null);
      await load();
      toast.success("Note supprimée.");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
      setShowDeleteDialog(false);
    }
  };

  const handleRevert = () => {
    setDraft(baseline);
    setEditorResetToken((token) => token + 1);
  };

  const handlePrintPdf = () => {
    const payload = buildPersonalNotePrintDocument({
      title: draft.title,
      category: draft.category,
      contentHtml: draft.content_html,
    });
    if (!payload) {
      toast.error("Ajoutez un titre avant d'exporter en PDF.");
      return;
    }
    void printDocument(payload);
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-xl border bg-card p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher…"
              className="pl-8"
            />
          </div>
          {categories.length > 0 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" className="w-full" onClick={() => requestAction({ type: "new" })}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nouvelle note
          </Button>
          {loading ? (
            <p className="text-sm text-muted-foreground p-2">Chargement…</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">Aucune note personnelle.</p>
          ) : filteredNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">Aucun résultat.</p>
          ) : (
            <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
              {filteredNotes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => requestAction({ type: "select", note })}
                    className={cn(
                      "w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-muted/70",
                      selectedId === note.id && "bg-muted"
                    )}
                  >
                    <span className="font-medium line-clamp-1 flex items-center gap-1">
                      {note.pinned && <Pin className="h-3 w-3 shrink-0" />}
                      {note.title}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {note.category && <span>{note.category}</span>}
                      <span>{formatNoteTimestamp(note.updated_at)}</span>
                    </span>
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
            resetToken={editorResetToken}
          />

          {selectedNote && (
            <p className="text-xs text-muted-foreground">
              Modifiée {formatNoteTimestamp(selectedNote.updated_at)}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {isDirty && (
              <span className="text-sm text-amber-700 dark:text-amber-400 mr-auto">
                Modifications non enregistrées
              </span>
            )}
            {isDirty && (
              <Button variant="ghost" size="sm" disabled={saving} onClick={handleRevert}>
                Annuler
              </Button>
            )}
            <Button disabled={saving || !isDirty} onClick={() => void handleSave()}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button
              variant="outline"
              disabled={saving || isPrinting || !draft.title.trim()}
              onClick={handlePrintPdf}
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              PDF
            </Button>
            {selectedId != null && (
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Supprimer
              </Button>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifications non enregistrées</AlertDialogTitle>
            <AlertDialogDescription>
              Des changements n&apos;ont pas été sauvegardés. Continuer sans enregistrer ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAction(null)}>
              Continuer l&apos;édition
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Quitter sans enregistrer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette note ?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedNote
                ? `« ${selectedNote.title} » sera définitivement supprimée.`
                : "Cette action est irréversible."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={saving}
              onClick={() => void handleDelete()}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
