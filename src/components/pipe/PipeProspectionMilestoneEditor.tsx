import { useState } from "react";
import { Calendar, Phone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import { Label } from "@/components/ui/label";
import {
  createEmptyTimelineAddState,
  datetimeLocalToUnix,
  defaultTimelineEntryTitle,
  PipeTimelineAddForm,
} from "@/components/pipe/PipeTimelineAddForm";
import { PipeProspectionContactSection } from "@/components/pipe/PipeProspectionContactSection";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { formatTimelineOccurredAt } from "@/lib/pipe/pipe-timeline-types";
import {
  PIPE_TIMELINE_TYPE_LABELS,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";
import { toast } from "sonner";

const PHASE_TYPE_ICONS = {
  APPEL: Phone,
  RDV: Calendar,
} as const;

interface PipeProspectionMilestoneEditorProps {
  contactId: number;
  phaseEntries: PipeTimelineEntryRecord[];
  draftNotes: string;
  saving: boolean;
  timeline: ReturnType<typeof usePipeTimeline>;
  onDraftNotesChange: (value: string) => void;
  onCancel: () => void;
  onSaveNotes: () => Promise<void>;
}

export function PipeProspectionMilestoneEditor({
  contactId,
  phaseEntries,
  draftNotes,
  saving,
  timeline,
  onDraftNotesChange,
  onCancel,
  onSaveNotes,
}: PipeProspectionMilestoneEditorProps) {
  const [addingType, setAddingType] = useState<"APPEL" | "RDV" | null>(null);
  const [occurredAt, setOccurredAt] = useState("");
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [adding, setAdding] = useState(false);

  const openAdd = (type: "APPEL" | "RDV") => {
    const state = createEmptyTimelineAddState(type);
    setAddingType(type);
    setOccurredAt(state.occurredAt);
    setTitre(state.titre);
    setContenu("");
  };

  const cancelAdd = () => {
    setAddingType(null);
    setTitre("");
    setContenu("");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingType) return;
    setAdding(true);
    try {
      await timeline.addEntry({
        entry_type: addingType,
        titre: titre.trim() || defaultTimelineEntryTitle(addingType),
        contenu: contenu.trim() || null,
        occurred_at: datetimeLocalToUnix(occurredAt),
      });
      toast.success(`${PIPE_TIMELINE_TYPE_LABELS[addingType]} ajouté`);
      cancelAdd();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleDeletePhaseEntry = async (entry: PipeTimelineEntryRecord) => {
    try {
      await timeline.removeEntry(entry.id);
      toast.success("Entrée supprimée");
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <div className="space-y-4">
      <PipeProspectionContactSection contactId={contactId} />

      <div className="space-y-2">
        <Label htmlFor="prospection-milestone-notes">Contexte prospection</Label>
        <DictationTextarea
          id="prospection-milestone-notes"
          value={draftNotes}
          onChange={onDraftNotesChange}
          rows={3}
          placeholder="Contexte, premières impressions…"
          disabled={saving}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Appels et RDV (phase prospection)</p>
          <div className="flex gap-1">
            {(["APPEL", "RDV"] as const).map((type) => {
              const Icon = PHASE_TYPE_ICONS[type];
              return (
                <Button
                  key={type}
                  type="button"
                  variant={addingType === type ? "secondary" : "outline"}
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => openAdd(type)}
                  disabled={saving || adding}
                >
                  <Icon className="h-3 w-3" />
                  {PIPE_TIMELINE_TYPE_LABELS[type]}
                </Button>
              );
            })}
          </div>
        </div>

        {phaseEntries.length === 0 ? (
          <p className="text-xs text-muted-foreground italic rounded-md border border-dashed px-3 py-2">
            Aucun appel ni RDV enregistré pendant la prospection.
          </p>
        ) : (
          <ul className="space-y-2 m-0 list-none p-0">
            {phaseEntries.map((entry) => {
              const Icon =
                entry.entry_type in PHASE_TYPE_ICONS
                  ? PHASE_TYPE_ICONS[entry.entry_type as keyof typeof PHASE_TYPE_ICONS]
                  : null;
              const typeLabel =
                PIPE_TIMELINE_TYPE_LABELS[entry.entry_type as PipeTimelineUserType] ??
                entry.entry_type;
              return (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-2 rounded-md border bg-background/60 px-3 py-2"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {Icon && <Icon className="h-3 w-3 shrink-0" />}
                      <span className="font-medium text-foreground/80">{typeLabel}</span>
                      <time>{formatTimelineOccurredAt(entry.occurred_at)}</time>
                    </div>
                    {entry.titre?.trim() && (
                      <p className="text-sm font-medium leading-snug">{entry.titre.trim()}</p>
                    )}
                    {entry.contenu?.trim() && (
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                        {entry.contenu.trim()}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label="Supprimer"
                    onClick={() => void handleDeletePhaseEntry(entry)}
                    disabled={saving || adding}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {addingType && (
          <PipeTimelineAddForm
            type={addingType}
            occurredAt={occurredAt}
            titre={titre}
            contenu={contenu}
            saving={adding}
            onOccurredAtChange={setOccurredAt}
            onTitreChange={setTitre}
            onContenuChange={setContenu}
            onCancel={cancelAdd}
            onSubmit={(e) => void handleAdd(e)}
          />
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
        <Button type="button" size="sm" onClick={() => void onSaveNotes()} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
