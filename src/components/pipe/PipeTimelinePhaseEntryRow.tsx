import { useState } from "react";
import { Calendar, FileText, Pencil, Phone, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  datetimeLocalToUnix,
  PipeTimelineAddForm,
} from "@/components/pipe/PipeTimelineAddForm";
import { PipeRdvOutcomeDialog } from "@/components/pipe/PipeRdvOutcomeDialog";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { toastAfterRdvSave, notifyGoogleCalendarSync } from "@/lib/pipe/pipe-rdv-entry-actions";
import { applyPipeRdvReschedule } from "@/lib/pipe/pipe-rdv-reschedule-actions";
import { isRdvTimelineTraceNote } from "@/lib/pipe/pipe-rdv-delete";
import {
  applyRdvStageOnSave,
  formatRdvEntryDisplayLabel,
  formatRdvEntryTitle,
  rdvStageFromEntryTitre,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import {
  formatTimelineOccurredAt,
  PIPE_TIMELINE_TYPE_LABELS,
  unixToDatetimeLocalInput,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";
import { toast } from "sonner";

const TYPE_ICONS = {
  APPEL: Phone,
  RDV: Calendar,
  NOTE: FileText,
  PROPOSITION: Send,
} as const;

interface PipeTimelinePhaseEntryRowProps {
  entry: PipeTimelineEntryRecord;
  pipe?:
    | (Pick<PipeRecord, "id" | "stage" | "pipe_type"> &
        Partial<Pick<PipeRecord, "contact_id" | "contact_prenom" | "contact_nom" | "titre">>)
    | null;
  timeline: ReturnType<typeof usePipeTimeline>;
  disabled?: boolean;
}

export function PipeTimelinePhaseEntryRow({
  entry,
  pipe,
  timeline,
  disabled = false,
}: PipeTimelinePhaseEntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [rdvOutcomeOpen, setRdvOutcomeOpen] = useState(false);
  const [occurredAt, setOccurredAt] = useState(() => unixToDatetimeLocalInput(entry.occurred_at));
  const [titre, setTitre] = useState(entry.titre ?? "");
  const [contenu, setContenu] = useState(entry.contenu ?? "");
  const [rdvStage, setRdvStage] = useState<PipeRdvStage>(
    () => rdvStageFromEntryTitre(entry.titre) ?? "R1"
  );
  const [saving, setSaving] = useState(false);

  const liveEntry = timeline.entries.find((e) => e.id === entry.id) ?? entry;

  const userType = liveEntry.entry_type as PipeTimelineUserType;
  const Icon =
    entry.entry_type in TYPE_ICONS
      ? TYPE_ICONS[entry.entry_type as keyof typeof TYPE_ICONS]
      : null;
  const typeLabel =
    entry.entry_type === "RDV"
      ? (formatRdvEntryDisplayLabel(entry) ?? "RDV")
      : (PIPE_TIMELINE_TYPE_LABELS[userType] ?? entry.entry_type);

  const startEdit = () => {
    setOccurredAt(unixToDatetimeLocalInput(entry.occurred_at));
    setTitre(entry.titre ?? "");
    setContenu(entry.contenu ?? "");
    setRdvStage(rdvStageFromEntryTitre(entry.titre) ?? "R1");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const occurredAtUnix = datetimeLocalToUnix(occurredAt);
      const nextTitre =
        userType === "RDV" ? formatRdvEntryTitle(rdvStage) : titre.trim() || null;

      if (userType === "RDV" && pipe && occurredAtUnix !== entry.occurred_at) {
        const calendar = await applyPipeRdvReschedule({
          timeline,
          entry,
          pipe: pipe as Pick<
            PipeRecord,
            | "id"
            | "stage"
            | "pipe_type"
            | "contact_id"
            | "contact_prenom"
            | "contact_nom"
            | "titre"
          >,
          rdvStage,
          newOccurredAtUnix: occurredAtUnix,
          contenu: contenu.trim() || null,
        });
        notifyGoogleCalendarSync(calendar);
        toast.success("RDV décalé — historique mis à jour");
        setEditing(false);
        return;
      }

      await timeline.updateEntry(entry.id, {
        titre: nextTitre,
        contenu: contenu.trim() || null,
        occurred_at: occurredAtUnix,
      });

      if (userType === "RDV" && pipe) {
        const result = await applyRdvStageOnSave({
          pipe,
          rdvStage,
          occurredAt: occurredAtUnix,
          notes: contenu.trim() || null,
        });

        toastAfterRdvSave(rdvStage, result, "Entrée mise à jour");
      } else {
        toast.success("Entrée mise à jour");
      }
      setEditing(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (entry.entry_type === "RDV") {
      setRdvOutcomeOpen(true);
      return;
    }
    if (isRdvTimelineTraceNote(entry)) {
      toast.error("Cette trace d'historique RDV ne peut pas être supprimée.");
      return;
    }
    try {
      await timeline.removeEntry(entry.id);
      toast.success("Entrée supprimée");
    } catch (err) {
      toast.error(String(err));
    }
  };

  if (editing) {
    return (
      <li className="list-none">
        <PipeTimelineAddForm
          type={userType}
          occurredAt={occurredAt}
          titre={titre}
          contenu={contenu}
          rdvStage={rdvStage}
          pipe={pipe}
          saving={saving}
          onOccurredAtChange={setOccurredAt}
          onTitreChange={setTitre}
          onContenuChange={setContenu}
          onRdvStageChange={setRdvStage}
          onCancel={cancelEdit}
          onSubmit={(e) => void saveEdit(e)}
          submitLabel="Enregistrer"
        />
      </li>
    );
  }

  return (
    <>
      <li className="flex items-start justify-between gap-2 rounded-md border bg-background/60 px-3 py-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {Icon && <Icon className="h-3 w-3 shrink-0" />}
            <span className="font-medium text-foreground/80">{typeLabel}</span>
            <time>{formatTimelineOccurredAt(entry.occurred_at)}</time>
          </div>
          {entry.entry_type !== "RDV" && entry.titre?.trim() && (
            <p className="text-sm font-medium leading-snug">{entry.titre.trim()}</p>
          )}
          {entry.contenu?.trim() && (
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {entry.contenu.trim()}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Modifier"
            onClick={startEdit}
            disabled={disabled}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Supprimer"
            onClick={() => void handleDelete()}
            disabled={disabled || isRdvTimelineTraceNote(entry)}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </li>

      {liveEntry.entry_type === "RDV" && (
        <PipeRdvOutcomeDialog
          open={rdvOutcomeOpen}
          entry={liveEntry}
          pipe={pipe}
          timeline={timeline}
          onClose={() => setRdvOutcomeOpen(false)}
          onReschedule={startEdit}
        />
      )}
    </>
  );
}
