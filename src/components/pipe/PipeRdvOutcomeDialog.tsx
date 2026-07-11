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
  applyRdvRevertToProspection,
  toastAfterRdvRevert,
} from "@/lib/pipe/pipe-rdv-delete-actions";
import {
  canRevertPipeToProspection,
  shouldHighlightRevertToProspection,
} from "@/lib/pipe/pipe-rdv-delete";
import { formatRdvEntryDisplayLabel } from "@/lib/pipe/pipe-rdv-stage";
import { formatTimelineOccurredAt } from "@/lib/pipe/pipe-timeline-types";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
import { toast } from "sonner";

interface PipeRdvOutcomeDialogProps {
  open: boolean;
  entry: PipeTimelineEntryRecord | null;
  allEntries: PipeTimelineEntryRecord[];
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  timeline: ReturnType<typeof usePipeTimeline>;
  onClose: () => void;
  onReschedule: () => void;
}

export function PipeRdvOutcomeDialog({
  open,
  entry,
  allEntries,
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
  const highlightRevert =
    pipe != null && shouldHighlightRevertToProspection(entry, allEntries, pipe.stage);
  const showRevert =
    pipe?.pipe_type === "AFFAIRE" && pipe.stage && canRevertPipeToProspection(pipe.stage);

  const handleCancelled = async () => {
    setSaving(true);
    try {
      await applyRdvCancelled({ timeline, entry, note });
      toast.success(
        highlightRevert
          ? `${rdvLabel} annulé — aucun RDV restant pour cette étape`
          : `${rdvLabel} annulé`
      );
      onClose();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async () => {
    if (!pipe) return;
    setSaving(true);
    try {
      await applyRdvRevertToProspection({ timeline, pipe, entry, note });
      toast.success(toastAfterRdvRevert(true));
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

        {highlightRevert && (
          <p className="text-xs text-amber-700 dark:text-amber-300 rounded-md border border-amber-200/80 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2">
            C&apos;était le dernier RDV de cette étape. Vous pouvez remettre l&apos;affaire en
            prospection si le rendez-vous ne se fera pas.
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
          {showRevert && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={saving}
              onClick={() => void handleRevert()}
            >
              Revenir en {PIPE_STAGE_LABELS.PROSPECTION}
            </Button>
          )}
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
