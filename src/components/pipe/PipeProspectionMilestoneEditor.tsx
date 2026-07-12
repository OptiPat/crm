import { useState } from "react";
import { Calendar, FileText, Phone, Send } from "lucide-react";
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
import { PipeTimelinePhaseEntryRow } from "@/components/pipe/PipeTimelinePhaseEntryRow";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import {
  addPipeTimelineEntryWithRdvStage,
  toastAfterRdvSave,
} from "@/lib/pipe/pipe-rdv-entry-actions";
import { buildPipeRdvCalendarContext } from "@/lib/pipe/pipe-rdv-calendar-context";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { formatRdvEntryTitle } from "@/lib/pipe/pipe-rdv-stage";
import type { PipeRdvSubmitPayload } from "@/components/pipe/PipeTimelineAddForm";
import {
  PIPE_TIMELINE_TYPE_LABELS,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";
import { toast } from "sonner";

const QUICK_ADD_TYPES = ["APPEL", "RDV", "NOTE"] as const;
const QUICK_ADD_ICONS = {
  APPEL: Phone,
  RDV: Calendar,
  NOTE: FileText,
  PROPOSITION: Send,
} as const;

interface PipeProspectionMilestoneEditorProps {
  contactId: number;
  pipe?: Pick<
    PipeRecord,
    "id" | "stage" | "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom" | "titre"
  > | null;
  phaseEntries: PipeTimelineEntryRecord[];
  draftNotes: string;
  saving: boolean;
  timeline: ReturnType<typeof usePipeTimeline>;
  onDraftNotesChange: (value: string) => void;
  onCancel: () => void;
  onSaveNotes: () => Promise<void>;
  onAfterEntryAdded?: () => void;
}

export function PipeProspectionMilestoneEditor({
  contactId,
  pipe,
  phaseEntries,
  draftNotes,
  saving,
  timeline,
  onDraftNotesChange,
  onCancel,
  onSaveNotes,
  onAfterEntryAdded,
}: PipeProspectionMilestoneEditorProps) {
  const [addingType, setAddingType] = useState<PipeTimelineUserType | null>(null);
  const [occurredAt, setOccurredAt] = useState("");
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [rdvStage, setRdvStage] = useState<PipeRdvStage>("R1");
  const [adding, setAdding] = useState(false);

  const openAdd = (type: PipeTimelineUserType) => {
    const state = createEmptyTimelineAddState(type);
    setAddingType(type);
    setOccurredAt(state.occurredAt);
    setTitre(state.titre);
    setContenu("");
    if (type === "RDV") setRdvStage("R1");
  };

  const cancelAdd = () => {
    setAddingType(null);
    setTitre("");
    setContenu("");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingType || addingType === "RDV") return;
    setAdding(true);
    try {
      const occurredAtUnix = datetimeLocalToUnix(occurredAt);
      await addPipeTimelineEntryWithRdvStage({
        timeline,
        pipe,
        calendar: pipe ? buildPipeRdvCalendarContext(pipe) : undefined,
        entryType: addingType,
        titre: titre.trim() || defaultTimelineEntryTitle(addingType),
        contenu: contenu.trim() || null,
        occurredAtUnix,
      });
      toast.success(`${PIPE_TIMELINE_TYPE_LABELS[addingType]} ajouté`);
      cancelAdd();
      onAfterEntryAdded?.();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleRdvSubmit = async (payload: PipeRdvSubmitPayload) => {
    setAdding(true);
    try {
      const result = await addPipeTimelineEntryWithRdvStage({
        timeline,
        pipe,
        calendar: pipe ? buildPipeRdvCalendarContext(pipe) : undefined,
        entryType: "RDV",
        rdvStage: payload.rdvStage,
        titre: formatRdvEntryTitle(payload.rdvStage),
        contenu: payload.contenu,
        occurredAtUnix: payload.occurredAtUnix,
        visio: payload.visio,
        physicalAddress: payload.physicalAddress,
      });
      toastAfterRdvSave(payload.rdvStage, result, `${PIPE_TIMELINE_TYPE_LABELS.RDV} ajouté`);
      cancelAdd();
      onAfterEntryAdded?.();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAdding(false);
    }
  };

  const rowDisabled = saving || adding;

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
          <p className="text-sm font-medium">Journal prospection</p>
          <div className="flex flex-wrap justify-end gap-1">
            {QUICK_ADD_TYPES.map((type) => {
              const Icon = QUICK_ADD_ICONS[type];
              return (
                <Button
                  key={type}
                  type="button"
                  variant={addingType === type ? "secondary" : "outline"}
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => openAdd(type)}
                  disabled={rowDisabled}
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
            Aucune activité enregistrée pendant la prospection.
          </p>
        ) : (
          <ul className="space-y-2 m-0 list-none p-0">
            {phaseEntries.map((entry) => (
              <PipeTimelinePhaseEntryRow
                key={entry.id}
                entry={entry}
                pipe={pipe}
                timeline={timeline}
                disabled={rowDisabled}
              />
            ))}
          </ul>
        )}

        {addingType && (
          <PipeTimelineAddForm
            type={addingType}
            occurredAt={occurredAt}
            titre={titre}
            contenu={contenu}
            rdvStage={rdvStage}
            pipe={pipe}
            contactId={pipe?.contact_id ?? contactId}
            saving={adding}
            onOccurredAtChange={setOccurredAt}
            onTitreChange={setTitre}
            onContenuChange={setContenu}
            onRdvStageChange={setRdvStage}
            onRdvSubmit={addingType === "RDV" ? handleRdvSubmit : undefined}
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
