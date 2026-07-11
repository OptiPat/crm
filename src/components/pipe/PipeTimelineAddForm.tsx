import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import {
  datetimeLocalToUnix,
  defaultTimelineEntryTitle,
  PIPE_TIMELINE_TYPE_LABELS,
  unixToDatetimeLocalInput,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";

interface PipeTimelineAddFormProps {
  type: PipeTimelineUserType;
  occurredAt: string;
  titre: string;
  contenu: string;
  saving: boolean;
  onOccurredAtChange: (value: string) => void;
  onTitreChange: (value: string) => void;
  onContenuChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (e: FormEvent) => void;
  submitLabel?: string;
}

export function PipeTimelineAddForm({
  type,
  occurredAt,
  titre,
  contenu,
  saving,
  onOccurredAtChange,
  onTitreChange,
  onContenuChange,
  onCancel,
  onSubmit,
  submitLabel = "Ajouter",
}: PipeTimelineAddFormProps) {
  return (
    <form onSubmit={onSubmit} className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <p className="text-sm font-medium">
        Nouvelle entrée — {PIPE_TIMELINE_TYPE_LABELS[type]}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Date et heure</Label>
          <Input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => onOccurredAtChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Titre</Label>
          <Input value={titre} onChange={(e) => onTitreChange(e.target.value)} />
        </div>
      </div>
      <DictationTextarea
        label="Détail"
        value={contenu}
        onChange={onContenuChange}
        rows={3}
        placeholder="Compte-rendu, prochaine étape…"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Enregistrement…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function createEmptyTimelineAddState(type: PipeTimelineUserType) {
  return {
    type,
    occurredAt: unixToDatetimeLocalInput(),
    titre: defaultTimelineEntryTitle(type),
    contenu: "",
  };
}

export { datetimeLocalToUnix, defaultTimelineEntryTitle };
