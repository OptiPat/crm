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
import type { PendingPipeStageAdvance } from "@/hooks/usePipeStageAdvance";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";

interface PipeStageAdvanceDialogProps {
  pending: PendingPipeStageAdvance | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (notes: string) => Promise<void>;
}

export function PipeStageAdvanceDialog({
  pending,
  saving,
  onCancel,
  onConfirm,
}: PipeStageAdvanceDialogProps) {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (pending) setNotes("");
  }, [pending]);

  const stageLabel = pending ? PIPE_STAGE_LABELS[pending.targetStage] : "";

  return (
    <Dialog open={pending != null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Passer à {stageLabel}</DialogTitle>
          <DialogDescription>
            {pending?.pipeTitle ? (
              <>
                <span className="font-medium text-foreground">{pending.pipeTitle}</span>
                {" — "}
              </>
            ) : null}
            Notes propres à cette étape (compte-rendu, prochaine action…).
          </DialogDescription>
        </DialogHeader>

        <DictationTextarea
          label="Notes de l'étape"
          value={notes}
          onChange={setNotes}
          rows={4}
          placeholder="Ex. RDV fixé, objections, suite à prévoir…"
          disabled={saving}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Annuler
          </Button>
          <Button type="button" onClick={() => void onConfirm(notes)} disabled={saving}>
            {saving ? "Enregistrement…" : "Valider l'avancement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
