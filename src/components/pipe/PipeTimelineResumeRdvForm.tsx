import { useState } from "react";
import {
  createEmptyTimelineAddState,
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
import {
  defaultPlanOptionForRdvStage,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { toast } from "sonner";

interface PipeTimelineResumeRdvFormProps {
  rdvStage: PipeRdvStage;
  rdvPlanOption?: PipeRdvPlanOption;
  pipe: Pick<
    PipeRecord,
    "id" | "stage" | "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom" | "titre"
  >;
  timeline: ReturnType<typeof usePipeTimeline>;
  onCancel: () => void;
  onSuccess?: () => void;
}

export function PipeTimelineResumeRdvForm({
  rdvStage,
  rdvPlanOption: rdvPlanOptionProp,
  pipe,
  timeline,
  onCancel,
  onSuccess,
}: PipeTimelineResumeRdvFormProps) {
  const rdvPlanOption = rdvPlanOptionProp ?? defaultPlanOptionForRdvStage(rdvStage);
  const [occurredAt, setOccurredAt] = useState(
    () => createEmptyTimelineAddState("RDV").occurredAt
  );
  const [contenu, setContenu] = useState("");
  const [saving, setSaving] = useState(false);

  const handleRdvSubmit = async (payload: PipeRdvSubmitPayload) => {
    setSaving(true);
    try {
      const result = await addPipeTimelineEntryWithRdvStage({
        timeline,
        pipe,
        calendar: buildPipeRdvCalendarContext(pipe),
        entryType: "RDV",
        rdvPlanOption: payload.rdvPlanOption,
        rdvStage: payload.rdvStage,
        titre: "",
        contenu: payload.contenu,
        occurredAtUnix: payload.occurredAtUnix,
        visio: payload.visio,
        physicalAddress: payload.physicalAddress,
      });
      toastAfterRdvSave(rdvStage, result, "RDV replanifié");
      onSuccess?.();
      onCancel();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PipeTimelineAddForm
      type="RDV"
      occurredAt={occurredAt}
      titre=""
      contenu={contenu}
      rdvPlanOption={rdvPlanOption}
      rdvPlanOptionReadOnly
      pipe={pipe}
      contactId={pipe.contact_id}
      saving={saving}
      onOccurredAtChange={setOccurredAt}
      onTitreChange={() => {}}
      onContenuChange={setContenu}
      onCancel={onCancel}
      onRdvSubmit={handleRdvSubmit}
      onSubmit={() => {}}
      submitLabel="Reprendre le RDV"
    />
  );
}
