import { useState } from "react";
import { Calendar, FileText, Phone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createEmptyTimelineAddState,
  datetimeLocalToUnix,
  defaultTimelineEntryTitle,
  PipeTimelineAddForm,
} from "@/components/pipe/PipeTimelineAddForm";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import {
  PIPE_TIMELINE_TYPE_LABELS,
  PIPE_TIMELINE_USER_TYPES,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";
import { toast } from "sonner";

const TYPE_ICONS = {
  APPEL: Phone,
  RDV: Calendar,
  NOTE: FileText,
  PROPOSITION: Send,
} as const;

interface PipeTimelineQuickAddProps {
  timeline: ReturnType<typeof usePipeTimeline>;
  onAdded?: () => void;
}

export function PipeTimelineQuickAdd({ timeline, onAdded }: PipeTimelineQuickAddProps) {
  const [addingType, setAddingType] = useState<PipeTimelineUserType | null>(null);
  const [occurredAt, setOccurredAt] = useState(() => createEmptyTimelineAddState("APPEL").occurredAt);
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [saving, setSaving] = useState(false);

  const openAdd = (type: PipeTimelineUserType) => {
    const state = createEmptyTimelineAddState(type);
    setAddingType(type);
    setOccurredAt(state.occurredAt);
    setTitre(state.titre);
    setContenu("");
  };

  const cancelAdd = () => {
    setAddingType(null);
    setTitre("");
    setContenu("");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingType) return;
    setSaving(true);
    try {
      await timeline.addEntry({
        entry_type: addingType,
        titre: titre.trim() || defaultTimelineEntryTitle(addingType),
        contenu: contenu.trim() || null,
        occurred_at: datetimeLocalToUnix(occurredAt),
      });
      toast.success("Entrée ajoutée");
      cancelAdd();
      onAdded?.();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Journal rapide</p>
        <p className="text-xs text-muted-foreground">
          Tracez un appel, un RDV ou une note — l&apos;historique complet est dans l&apos;onglet
          Historique.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PIPE_TIMELINE_USER_TYPES.map((type) => {
          const Icon = TYPE_ICONS[type];
          return (
            <Button
              key={type}
              type="button"
              variant={addingType === type ? "secondary" : "outline"}
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => openAdd(type)}
            >
              <Icon className="h-3.5 w-3.5" />
              {PIPE_TIMELINE_TYPE_LABELS[type]}
            </Button>
          );
        })}
      </div>

      {addingType && (
        <PipeTimelineAddForm
          type={addingType}
          occurredAt={occurredAt}
          titre={titre}
          contenu={contenu}
          saving={saving}
          onOccurredAtChange={setOccurredAt}
          onTitreChange={setTitre}
          onContenuChange={setContenu}
          onCancel={cancelAdd}
          onSubmit={(e) => void handleAdd(e)}
        />
      )}
    </div>
  );
}
