import { useState } from "react";
import {
  Calendar,
  FileText,
  Phone,
  Scale,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import {
  datetimeLocalToUnix,
  defaultTimelineEntryTitle,
  unixToDatetimeLocalInput,
} from "@/lib/pipe/pipe-timeline-types";
import {
  SUIVI_TIMELINE_TYPES,
  suiviTimelineTypeLabel,
  type SuiviTimelineType,
} from "@/lib/pipe/pipe-suivi";
import { toast } from "sonner";
import {
  createPlacementOperation,
  notifyPlacementOperationsChanged,
} from "@/lib/api/tauri-box-placement";

const TYPE_ICONS: Record<SuiviTimelineType, typeof Phone> = {
  APPEL: Phone,
  RDV: Calendar,
  NOTE: FileText,
  ARBITRAGE: Scale,
  REINVESTISSEMENT: TrendingUp,
};

interface PipeSuiviQuickAddProps {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe: Pick<
    PipeRecord,
    | "id"
    | "stage"
    | "pipe_type"
    | "contact_id"
    | "contact_prenom"
    | "contact_nom"
    | "secondary_contact_id"
    | "secondary_contact_prenom"
    | "secondary_contact_nom"
    | "titre"
  >;
  onAdded?: () => void;
  /** Ouvre le dialogue planification (comme Planifier R1). */
  onPlanSuiviRdv?: () => void;
}

export function PipeSuiviQuickAdd({ timeline, pipe, onAdded, onPlanSuiviRdv }: PipeSuiviQuickAddProps) {
  const [addingType, setAddingType] = useState<SuiviTimelineType | null>(null);
  const [occurredAt, setOccurredAt] = useState(() => unixToDatetimeLocalInput());
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [saving, setSaving] = useState(false);

  const openAdd = (type: SuiviTimelineType) => {
    if (type === "RDV") {
      onPlanSuiviRdv?.();
      return;
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingType) return;
    setSaving(true);
    try {
      const occurredAtUnix = datetimeLocalToUnix(occurredAt);

      const entry = await timeline.addEntry({
        entry_type: addingType,
        titre: titre.trim() || defaultTimelineEntryTitle(addingType),
        contenu: contenu.trim() || null,
        occurred_at: occurredAtUnix,
      });
      toast.success("Entrée ajoutée");

      if (
        (addingType === "ARBITRAGE" || addingType === "REINVESTISSEMENT") &&
        pipe.contact_id
      ) {
        try {
          await createPlacementOperation({
            contact_id: pipe.contact_id,
            pipe_id: pipe.id,
            pipe_timeline_entry_id: entry.id,
            operation_type: addingType,
          });
          notifyPlacementOperationsChanged();
        } catch (trackErr) {
          console.error(trackErr);
          toast.warning(
            "Entrée ajoutée, mais le suivi partenaire Stellium n'a pas pu être créé."
          );
        }
      }

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
      <div>
        <p className="text-sm font-medium">Journal du suivi</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          Aucun acte n&apos;impose de RDV — commencez par un appel, un SMS (note), un arbitrage…
          Le RDV de suivi reste disponible si vous l&apos;avez planifié.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUIVI_TIMELINE_TYPES.map((type) => {
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
              {suiviTimelineTypeLabel(type)}
            </Button>
          );
        })}
      </div>

      {addingType && (
        <form onSubmit={(e) => void handleSubmit(e)} className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <p className="text-sm font-medium">
            Nouvelle entrée — {suiviTimelineTypeLabel(addingType)}
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
          <DictationTextarea
            label="Détail"
            value={contenu}
            onChange={setContenu}
            rows={3}
            placeholder={
              addingType === "ARBITRAGE"
                ? "Support concerné, décision, prochaine étape…"
                : addingType === "REINVESTISSEMENT"
                  ? "Destination, montant, contexte…"
                  : addingType === "NOTE"
                    ? "SMS, compte-rendu, prochaine étape…"
                    : "Compte-rendu, prochaine étape…"
            }
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancelAdd}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Enregistrement…" : "Ajouter"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
