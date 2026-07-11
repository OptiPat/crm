import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { resolvePipeRdvGoogleEventId } from "@/lib/api/tauri-calendar";
import { cancelLinkedGoogleRdv } from "@/lib/calendar/rdv-planifier";
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
  const [cancelGoogle, setCancelGoogle] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolvedGoogleEventId, setResolvedGoogleEventId] = useState<string | null>(null);

  const liveEntry = useMemo(() => {
    if (!entry) return null;
    return timeline.entries.find((e) => e.id === entry.id) ?? entry;
  }, [entry, timeline.entries]);

  useEffect(() => {
    if (!open || !liveEntry) {
      setResolvedGoogleEventId(null);
      return;
    }
    setNote("");
    setCancelGoogle(true);
    const direct = liveEntry.google_event_id?.trim();
    if (direct) {
      setResolvedGoogleEventId(direct);
      return;
    }
    let cancelled = false;
    void resolvePipeRdvGoogleEventId(liveEntry.id).then((id) => {
      if (!cancelled) setResolvedGoogleEventId(id?.trim() || null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, liveEntry]);

  if (!liveEntry) return null;

  const hasGoogleLink = Boolean(resolvedGoogleEventId);
  const rdvLabel = formatRdvEntryDisplayLabel(liveEntry) ?? "RDV";
  const occurredLabel = formatTimelineOccurredAt(liveEntry.occurred_at);
  const willRevertToProspection =
    pipe?.pipe_type === "AFFAIRE" &&
    pipe.stage !== "PROSPECTION" &&
    canRevertPipeToProspection(pipe.stage);

  const handleCancelled = async () => {
    setSaving(true);
    try {
      if (cancelGoogle && hasGoogleLink) {
        await cancelLinkedGoogleRdv(resolvedGoogleEventId);
      }
      const result = await applyRdvCancelled({ timeline, pipe, entry: liveEntry, note });
      const message = toastAfterRdvCancelled(rdvLabel, result);
      toast.success(
        cancelGoogle && hasGoogleLink ? `${message} — événement Google retiré` : message
      );
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

        {hasGoogleLink && (
          <div className="flex items-start gap-2 rounded-md border px-3 py-2">
            <Checkbox
              id="cancel-google-rdv"
              checked={cancelGoogle}
              onCheckedChange={(v) => setCancelGoogle(v === true)}
              disabled={saving}
            />
            <Label htmlFor="cancel-google-rdv" className="text-sm font-normal leading-snug">
              Supprimer aussi l&apos;événement Google Agenda lié
            </Label>
          </div>
        )}

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
