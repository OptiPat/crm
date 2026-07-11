import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import {
  applyRdvCancelled,
  toastAfterRdvCancelled,
} from "@/lib/pipe/pipe-rdv-delete-actions";
import { canRevertPipeToProspection } from "@/lib/pipe/pipe-rdv-delete";
import { formatRdvEntryDisplayLabel } from "@/lib/pipe/pipe-rdv-stage";
import { formatTimelineOccurredAt } from "@/lib/pipe/pipe-timeline-types";
import { toast } from "sonner";

interface PipeRdvOutcomeDialogProps {
  open: boolean;
  entry: PipeTimelineEntryRecord | null;
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  timeline: ReturnType<typeof usePipeTimeline>;
  onClose: () => void;
  onReschedule: () => void;
}

export function PipeRdvOutcomeDialog({
  open,
  entry,
  pipe,
  timeline,
  onClose,
  onReschedule,
}: PipeRdvOutcomeDialogProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setNote("");
  }, [open, entry?.id]);

  if (!entry) return null;

  const rdvLabel = formatRdvEntryDisplayLabel(entry) ?? "RDV";
  const occurredLabel = formatTimelineOccurredAt(entry.occurred_at);
  const willRevertToProspection =
    pipe?.pipe_type === "AFFAIRE" &&
    pipe.stage !== "PROSPECTION" &&
    canRevertPipeToProspection(pipe.stage);

  const handleCancelled = async () => {
    setSaving(true);
    try {
      const result = await applyRdvCancelled({ timeline, pipe, entry, note });
      toast.success(toastAfterRdvCancelled(rdvLabel, result));
      onClose();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReschedule = () => {
    onClose();
    onReschedule();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{rdvLabel}</DialogTitle>
          <DialogDescription>
            Prévu le {occurredLabel}. Que souhaitez-vous faire ?
          </DialogDescription>
        </DialogHeader>

        <DictationTextarea
          label="Note (optionnelle)"
          value={note}
          onChange={setNote}
          rows={3}
          placeholder="Motif d'annulation, report, contexte…"
          disabled={saving}
        />

        {willRevertToProspection && (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
            L&apos;annulation remettra l&apos;affaire en prospection.
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={saving}
            onClick={() => void handleCancelled()}
          >
            {saving ? "Enregistrement…" : "RDV annulé"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={saving}
            onClick={handleReschedule}
          >
            RDV décalé — reproposer une date
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={saving}
            onClick={onClose}
          >
            Fermer sans modifier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
