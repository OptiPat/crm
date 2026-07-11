import { useState } from "react";
import { Calendar, FileText, Pencil, Phone, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  datetimeLocalToUnix,
  PipeTimelineAddForm,
} from "@/components/pipe/PipeTimelineAddForm";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
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
  timeline: ReturnType<typeof usePipeTimeline>;
  disabled?: boolean;
}

export function PipeTimelinePhaseEntryRow({
  entry,
  timeline,
  disabled = false,
}: PipeTimelinePhaseEntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [occurredAt, setOccurredAt] = useState(() => unixToDatetimeLocalInput(entry.occurred_at));
  const [titre, setTitre] = useState(entry.titre ?? "");
  const [contenu, setContenu] = useState(entry.contenu ?? "");
  const [saving, setSaving] = useState(false);

  const userType = entry.entry_type as PipeTimelineUserType;
  const Icon =
    entry.entry_type in TYPE_ICONS
      ? TYPE_ICONS[entry.entry_type as keyof typeof TYPE_ICONS]
      : null;
  const typeLabel = PIPE_TIMELINE_TYPE_LABELS[userType] ?? entry.entry_type;

  const startEdit = () => {
    setOccurredAt(unixToDatetimeLocalInput(entry.occurred_at));
    setTitre(entry.titre ?? "");
    setContenu(entry.contenu ?? "");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await timeline.updateEntry(entry.id, {
        titre: titre.trim() || null,
        contenu: contenu.trim() || null,
        occurred_at: datetimeLocalToUnix(occurredAt),
      });
      toast.success("Entrée mise à jour");
      setEditing(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
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
          saving={saving}
          onOccurredAtChange={setOccurredAt}
          onTitreChange={setTitre}
          onContenuChange={setContenu}
          onCancel={cancelEdit}
          onSubmit={(e) => void saveEdit(e)}
          submitLabel="Enregistrer"
        />
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-2 rounded-md border bg-background/60 px-3 py-2">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {Icon && <Icon className="h-3 w-3 shrink-0" />}
          <span className="font-medium text-foreground/80">{typeLabel}</span>
          <time>{formatTimelineOccurredAt(entry.occurred_at)}</time>
        </div>
        {entry.titre?.trim() && (
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
          disabled={disabled}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    </li>
  );
}
