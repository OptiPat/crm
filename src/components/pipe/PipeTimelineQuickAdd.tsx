import { useState } from "react";
import { Calendar, FileText, Phone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createEmptyTimelineAddState,
  datetimeLocalToUnix,
  defaultTimelineEntryTitle,
  PipeTimelineAddForm,
  type PipeRdvSubmitPayload,
} from "@/components/pipe/PipeTimelineAddForm";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import {
  addPipeTimelineEntryWithRdvStage,
  toastAfterRdvSave,
} from "@/lib/pipe/pipe-rdv-entry-actions";
import { buildPipeRdvCalendarContext } from "@/lib/pipe/pipe-rdv-calendar-context";
import type { PipeRdvPlanOption } from "@/lib/pipe/pipe-rdv-plan-option";
import {
  PIPE_TIMELINE_QUICK_ADD_TYPES,
  PIPE_TIMELINE_TYPE_LABELS,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";

type PipeTimelineQuickAddType = (typeof PIPE_TIMELINE_QUICK_ADD_TYPES)[number];
import { toast } from "sonner";

const TYPE_ICONS: Record<PipeTimelineQuickAddType, typeof Phone> = {
  APPEL: Phone,
  RDV: Calendar,
  NOTE: FileText,
  PROPOSITION: Send,
};

interface PipeTimelineQuickAddProps {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe?: Pick<
    PipeRecord,
    "id" | "stage" | "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom" | "titre"
  > | null;
  onAdded?: () => void;
}

export function PipeTimelineQuickAdd({ timeline, pipe, onAdded }: PipeTimelineQuickAddProps) {
  const [addingType, setAddingType] = useState<PipeTimelineUserType | null>(null);
  const [occurredAt, setOccurredAt] = useState(() => createEmptyTimelineAddState("APPEL").occurredAt);
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [rdvPlanOption, setRdvPlanOption] = useState<PipeRdvPlanOption>("R1");
  const [saving, setSaving] = useState(false);

  const openAdd = (type: PipeTimelineUserType) => {
    const state = createEmptyTimelineAddState(type);
    setAddingType(type);
    setOccurredAt(state.occurredAt);
    setTitre(state.titre);
    setContenu("");
    if (type === "RDV") setRdvPlanOption("R1");
  };

  const cancelAdd = () => {
    setAddingType(null);
    setTitre("");
    setContenu("");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingType || addingType === "RDV") return;
    setSaving(true);
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
      toast.success("Entrée ajoutée");
      cancelAdd();
      onAdded?.();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRdvSubmit = async (payload: PipeRdvSubmitPayload) => {
    setSaving(true);
    try {
      const result = await addPipeTimelineEntryWithRdvStage({
        timeline,
        pipe,
        calendar: pipe ? buildPipeRdvCalendarContext(pipe) : undefined,
        entryType: "RDV",
        rdvPlanOption: payload.rdvPlanOption,
        rdvStage: payload.rdvStage,
        titre: "",
        contenu: payload.contenu,
        occurredAtUnix: payload.occurredAtUnix,
        visio: payload.visio,
        physicalAddress: payload.physicalAddress,
      });
      toastAfterRdvSave(payload.rdvStage, result);
      cancelAdd();
      onAdded?.();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Journal rapide</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          Appel, note, proposition ou RDV commercial. Les envois chez Stellium se déclarent dans la
          section ci-dessus.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PIPE_TIMELINE_QUICK_ADD_TYPES.map((type) => {
          const Icon = TYPE_ICONS[type];
          return (
            <Button
              key={type}
              type="button"
              variant={addingType === type ? "secondary" : "outline"}
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => openAdd(type)}
            >
              <Icon className="h-3.5 w-3.5" />
              {PIPE_TIMELINE_TYPE_LABELS[type]}
            </Button>
          );
        })}
      </div>

      {addingType && (
        <PipeTimelineAddForm
          type={addingType}
          occurredAt={occurredAt}
          titre={titre}
          contenu={contenu}
          rdvPlanOption={rdvPlanOption}
          pipe={pipe}
          contactId={pipe?.contact_id}
          saving={saving}
          onOccurredAtChange={setOccurredAt}
          onTitreChange={setTitre}
          onContenuChange={setContenu}
          onRdvPlanOptionChange={setRdvPlanOption}
          onRdvSubmit={addingType === "RDV" ? handleRdvSubmit : undefined}
          onCancel={cancelAdd}
          onSubmit={(e) => void handleAdd(e)}
        />
      )}
    </div>
  );
}
