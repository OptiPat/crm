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
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import type { GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  datetimeLocalToUnix,
  RDV_DURATION_PRESETS,
  rdvDurationMinutesFromPreset,
  syncEndFromStartAndDuration,
  unixToDatetimeLocalInput,
  type RdvDurationPresetId,
} from "@/lib/calendar/rdv-duration";
import { openExternalUrl } from "@/lib/api/tauri-system";
import {
  cancelPipeRdvFromAgenda,
  loadAgendaPipeRdvContext,
  pipeRdvDurationMinutes,
  pipeRdvEndAtFromDuration,
  reschedulePipeRdvFromAgenda,
} from "@/lib/pipe/pipe-rdv-agenda-actions";
import { toastAfterRdvCancelled } from "@/lib/pipe/pipe-rdv-delete-actions";
import { toastAfterPipeRdvReschedule } from "@/lib/pipe/pipe-rdv-entry-actions";
import { formatPipeRdvCalendarContactLabel, formatPipeRdvGoogleCalendarTitle } from "@/lib/pipe/pipe-rdv-google-calendar";
import {
  formatRdvEntryDisplayLabel,
  rdvStageFromEntryTitre,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import { toast } from "sonner";

interface AgendaPipeRdvManageDialogProps {
  open: boolean;
  event: GoogleCalendarWeekEvent | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function AgendaPipeRdvManageDialog({
  open,
  event,
  onOpenChange,
  onChanged,
}: AgendaPipeRdvManageDialogProps) {
  const [pipe, setPipe] = useState<PipeRecord | null>(null);
  const [entry, setEntry] = useState<PipeTimelineEntryRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"menu" | "cancel">("menu");
  const [start, setStart] = useState("");
  const [durationPreset, setDurationPreset] = useState<RdvDurationPresetId>("60");
  const [cancelNote, setCancelNote] = useState("");
  const [cancelGoogle, setCancelGoogle] = useState(true);

  useEffect(() => {
    if (!open || !event?.pipe_id || !event.pipe_timeline_entry_id) {
      setPipe(null);
      setEntry(null);
      setMode("menu");
      return;
    }
    setLoading(true);
    void loadAgendaPipeRdvContext(event.pipe_id, event.pipe_timeline_entry_id)
      .then(({ pipe: p, entry: e }) => {
        setPipe(p);
        setEntry(e);
        setStart(unixToDatetimeLocalInput(event.start_at));
        const durationMin = pipeRdvDurationMinutes(event.start_at, event.end_at);
        const preset =
          RDV_DURATION_PRESETS.find((p) => p.minutes === durationMin)?.id ?? "60";
        setDurationPreset(preset);
        setCancelNote("");
        setCancelGoogle(true);
        setMode("menu");
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Impossible de charger le RDV Pipe");
        onOpenChange(false);
      })
      .finally(() => setLoading(false));
  }, [open, event, onOpenChange]);

  if (!event) return null;

  const rdvStage: PipeRdvStage = rdvStageFromEntryTitre(entry?.titre) ?? "R1";
  const calendarTitle = pipe
    ? formatPipeRdvGoogleCalendarTitle(rdvStage, formatPipeRdvCalendarContactLabel(pipe))
    : event.title;
  const hasGoogleLink = Boolean(entry?.google_event_id?.trim() || event.google_event_id);

  const handleReschedule = async () => {
    if (!pipe || !entry || !start) return;
    const startAt = datetimeLocalToUnix(start);
    const endAt = pipeRdvEndAtFromDuration(
      startAt,
      rdvDurationMinutesFromPreset(durationPreset)
    );
    if (endAt <= startAt) {
      toast.error("L'heure de fin doit être après le début.");
      return;
    }
    setSaving(true);
    try {
      const calendar = await reschedulePipeRdvFromAgenda({
        pipe,
        entry,
        rdvStage,
        startAtUnix: startAt,
        endAtUnix: endAt,
        calendarTitle,
      });
      toastAfterPipeRdvReschedule(calendar);
      onOpenChange(false);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du décalage");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!entry) return;
    setSaving(true);
    try {
      const result = await cancelPipeRdvFromAgenda({
        pipe,
        entry,
        note: cancelNote.trim() || null,
        cancelGoogle: cancelGoogle && hasGoogleLink,
      });
      const message = toastAfterRdvCancelled(result.rdvLabel, result);
      toast.success(
        cancelGoogle && hasGoogleLink ? `${message} — événement Google retiré` : message
      );
      onOpenChange(false);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'annulation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {entry ? (formatRdvEntryDisplayLabel(entry) ?? "RDV Pipe") : "RDV Pipe"}
          </DialogTitle>
          <DialogDescription>
            {pipe ? `Affaire « ${pipe.titre} » — lié au journal Pipe.` : "Chargement…"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Chargement…</p>
        ) : mode === "cancel" ? (
          <div className="space-y-3 py-2">
            <DictationTextarea
              label="Note (optionnelle)"
              value={cancelNote}
              onChange={setCancelNote}
              rows={3}
              placeholder="Motif d'annulation…"
              disabled={saving}
            />
            {hasGoogleLink && (
              <div className="flex items-start gap-2 rounded-md border px-3 py-2">
                <Checkbox
                  id="agenda-cancel-google"
                  checked={cancelGoogle}
                  onCheckedChange={(v) => setCancelGoogle(v === true)}
                  disabled={saving}
                />
                <Label htmlFor="agenda-cancel-google" className="text-sm font-normal leading-snug">
                  Supprimer aussi l&apos;événement Google Agenda
                </Label>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="agenda-rdv-start">Nouveau créneau</Label>
                <Input
                  id="agenda-rdv-start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label>Durée</Label>
                <Select
                  value={durationPreset}
                  onValueChange={(v) => setDurationPreset(v as RdvDurationPresetId)}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RDV_DURATION_PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Fin :{" "}
              {start
                ? syncEndFromStartAndDuration(
                    start,
                    rdvDurationMinutesFromPreset(durationPreset)
                  ).replace("T", " ")
                : "—"}
            </p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          {mode === "cancel" ? (
            <>
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                disabled={saving}
                onClick={() => void handleCancel()}
              >
                {saving ? "Enregistrement…" : "Confirmer l'annulation"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={saving}
                onClick={() => setMode("menu")}
              >
                Retour
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                className="w-full"
                disabled={saving || !pipe || !entry}
                onClick={() => void handleReschedule()}
              >
                {saving ? "Enregistrement…" : "Enregistrer le nouveau créneau"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                disabled={saving || !entry}
                onClick={() => setMode("cancel")}
              >
                Annuler le RDV
              </Button>
              {event.html_link && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={saving}
                  onClick={() => void openExternalUrl(event.html_link!)}
                >
                  Ouvrir dans Google Agenda
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Fermer
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
