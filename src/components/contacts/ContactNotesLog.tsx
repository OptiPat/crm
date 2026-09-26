import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  appendContactNote,
  deleteContactNote,
  listContactNotesNewestFirst,
  updateContactNote,
} from "@/lib/contacts/contact-notes-log";

type ContactNotesLogProps = {
  notes?: string | null;
  onChange: (nextNotes: string) => void | Promise<void>;
  busy?: boolean;
};

/** Journal de notes : ajout, modification et suppression. */
export function ContactNotesLog({ notes, onChange, busy = false }: ContactNotesLogProps) {
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);
  const entries = listContactNotesNewestFirst(notes);
  const canAdd = draft.trim().length > 0 && !busy && editingIndex == null;

  const apply = async (next: string, done: () => void) => {
    try {
      await onChange(next);
      done();
    } catch {
      // Le parent affiche l'erreur ; l'édition reste ouverte.
    }
  };

  const add = () => {
    if (!canAdd) return;
    void apply(appendContactNote(notes, draft), () => setDraft(""));
  };

  const saveEdit = () => {
    if (editingIndex == null || !editDraft.trim() || busy) return;
    void apply(updateContactNote(notes, editingIndex, editDraft), () => {
      setEditingIndex(null);
      setEditDraft("");
    });
  };

  const remove = (index: number) => {
    if (busy) return;
    void apply(deleteContactNote(notes, index), () => setConfirmDeleteIndex(null));
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={3}
        placeholder="Nouvelle note"
        disabled={busy || editingIndex != null}
      />
      <Button type="button" size="sm" onClick={add} disabled={!canAdd}>
        {busy && editingIndex == null && confirmDeleteIndex == null ? "Ajout…" : "Ajouter"}
      </Button>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Aucune note pour ce contact</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const editing = editingIndex === entry.index;
            const confirming = confirmDeleteIndex === entry.index;
            return (
              <li key={`${entry.at ?? "legacy"}-${entry.index}`} className="rounded-md border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{entry.at ?? "Sans date"}</p>
                  {!editing && !confirming && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        disabled={busy}
                        onClick={() => {
                          setConfirmDeleteIndex(null);
                          setEditingIndex(entry.index);
                          setEditDraft(entry.body);
                        }}
                      >
                        Modifier
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => {
                          setEditingIndex(null);
                          setEditDraft("");
                          setConfirmDeleteIndex(entry.index);
                        }}
                      >
                        Supprimer
                      </Button>
                    </div>
                  )}
                </div>
                {editing ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      rows={3}
                      disabled={busy}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveEdit}
                        disabled={busy || !editDraft.trim()}
                      >
                        Enregistrer
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditingIndex(null);
                          setEditDraft("");
                        }}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : confirming ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm">Supprimer cette note ?</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => remove(entry.index)}
                    >
                      Supprimer
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmDeleteIndex(null)}
                    >
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm">{entry.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
