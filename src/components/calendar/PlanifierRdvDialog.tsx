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
import { createCalendarRdv } from "@/lib/api/tauri-calendar";
import { runRelationAutoSync } from "@/lib/emails/relation-auto-sync";
import { toast } from "sonner";

function localDatetimeToUnix(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

export function PlanifierRdvDialog({
  open,
  onOpenChange,
  contactId,
  contactLabel,
  alerteId,
  tacheId,
  defaultTitle,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number;
  contactLabel: string;
  alerteId?: number | null;
  tacheId?: number | null;
  defaultTitle?: string;
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle ?? `RDV — ${contactLabel}`);
    const s = defaultStart();
    setStart(s);
    const endDate = new Date(s);
    endDate.setHours(endDate.getHours() + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    setEnd(
      `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:00`
    );
  }, [open, contactLabel, defaultTitle]);

  const handleSubmit = async () => {
    if (!start || !end) return;
    const startAt = localDatetimeToUnix(start);
    const endAt = localDatetimeToUnix(end);
    if (endAt <= startAt) {
      toast.error("L'heure de fin doit être après le début.");
      return;
    }
    setSubmitting(true);
    try {
      await createCalendarRdv({
        contactId,
        alerteId,
        tacheId,
        title: title.trim() || `RDV — ${contactLabel}`,
        startAt,
        endAt,
      });
      try {
        const sync = await runRelationAutoSync();
        if (sync.calendar_accepted > 0) {
          toast.success("RDV créé — client a déjà confirmé dans Agenda");
        } else {
          toast.success("RDV créé dans Google Agenda");
        }
      } catch {
        toast.success("RDV créé dans Google Agenda");
      }
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur création RDV");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Planifier un RDV</DialogTitle>
          <DialogDescription>
            {contactLabel} — événement envoyé dans votre Google Agenda
            {alerteId ? " (lié à l'alerte)" : tacheId ? " (lié à la tâche)" : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="rdv-title">Titre</Label>
            <Input id="rdv-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rdv-start">Début</Label>
            <Input
              id="rdv-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rdv-end">Fin</Label>
            <Input
              id="rdv-end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? "Création…" : "Créer dans Agenda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
