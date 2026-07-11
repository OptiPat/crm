import { useCallback, useEffect, useState } from "react";
import { Calendar, FileText, Phone, Send, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  createPipeTimelineEntry,
  deletePipeTimelineEntry,
  listPipeTimelineEntries,
  type PipeTimelineEntryRecord,
} from "@/lib/api/tauri-pipe-timeline";
import { subscribePipeChanged } from "@/lib/pipe/pipe-events";
import {
  PIPE_TIMELINE_TYPE_LABELS,
  PIPE_TIMELINE_USER_TYPES,
  datetimeLocalToUnix,
  defaultTimelineEntryTitle,
  formatTimelineOccurredAt,
  unixToDatetimeLocalInput,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TYPE_ICONS = {
  APPEL: Phone,
  RDV: Calendar,
  NOTE: FileText,
  PROPOSITION: Send,
} as const;

interface PipeTimelineSectionProps {
  pipeId: number;
}

export function PipeTimelineSection({ pipeId }: PipeTimelineSectionProps) {
  const [entries, setEntries] = useState<PipeTimelineEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingType, setAddingType] = useState<PipeTimelineUserType | null>(null);
  const [occurredAt, setOccurredAt] = useState(() => unixToDatetimeLocalInput());
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listPipeTimelineEntries(pipeId);
      setEntries(rows);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [pipeId]);

  useEffect(() => {
    setLoading(true);
    void load();
    return subscribePipeChanged(() => {
      void load();
    });
  }, [load]);

  const openAdd = (type: PipeTimelineUserType) => {
    setAddingType(type);
    setOccurredAt(unixToDatetimeLocalInput());
    setTitre(defaultTimelineEntryTitle(type));
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
      await createPipeTimelineEntry({
        pipe_id: pipeId,
        entry_type: addingType,
        titre: titre.trim() || defaultTimelineEntryTitle(addingType),
        contenu: contenu.trim() || null,
        occurred_at: datetimeLocalToUnix(occurredAt),
      });
      toast.success("Entrée ajoutée");
      cancelAdd();
      await load();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: PipeTimelineEntryRecord) => {
    if (entry.entry_type === "CREATION" || entry.entry_type === "AVANCEMENT") return;
    try {
      await deletePipeTimelineEntry(entry.id);
      toast.success("Entrée supprimée");
      await load();
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Timeline</p>
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
      </div>

      {addingType && (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border bg-muted/20 p-4 space-y-3"
        >
          <p className="text-sm font-medium">
            Nouvelle entrée — {PIPE_TIMELINE_TYPE_LABELS[addingType]}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date et heure</Label>
              <Input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Titre</Label>
              <Input value={titre} onChange={(e) => setTitre(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Détail</Label>
            <Textarea
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              rows={3}
              placeholder="Compte-rendu, prochaine étape…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancelAdd}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Ajout…" : "Ajouter"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement de la timeline…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4 text-center">
          Aucune entrée pour le moment.
        </p>
      ) : (
        <ol className="relative space-y-0 border-l border-border ml-2 pl-4">
          {entries.map((entry) => {
            const isSystem = entry.entry_type === "CREATION" || entry.entry_type === "AVANCEMENT";
            const isCreation = entry.entry_type === "CREATION";
            const userType = entry.entry_type as PipeTimelineUserType;
            const Icon =
              entry.entry_type === "AVANCEMENT"
                ? TrendingUp
                : !isCreation && userType in TYPE_ICONS
                  ? TYPE_ICONS[userType as keyof typeof TYPE_ICONS]
                  : null;
            const label =
              PIPE_TIMELINE_TYPE_LABELS[entry.entry_type as keyof typeof PIPE_TIMELINE_TYPE_LABELS] ??
              entry.entry_type;

            return (
              <li key={entry.id} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={isSystem ? "secondary" : "outline"} className="font-normal gap-1">
                        {Icon && <Icon className="h-3 w-3" />}
                        {label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTimelineOccurredAt(entry.occurred_at)}
                      </span>
                    </div>
                    {entry.titre && (
                      <p className={cn("text-sm", isSystem && "text-muted-foreground")}>
                        {entry.titre}
                      </p>
                    )}
                    {entry.contenu && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entry.contenu}</p>
                    )}
                  </div>
                  {!isSystem && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="Supprimer l'entrée"
                      onClick={() => void handleDelete(entry)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
