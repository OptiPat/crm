import { useState } from "react";
import { Banknote, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { journalAffairePartenairePlacement } from "@/lib/placement/pipe-placement-tracking";
import type { PlacementPartenaireJournalKind } from "@/lib/placement/pipe-placement-partenaire-types";
import { toast } from "sonner";

interface PipeAffairePlacementSectionProps {
  pipe: Pick<PipeRecord, "id" | "contact_id" | "parent_pipe_id" | "titre">;
  timeline: ReturnType<typeof usePipeTimeline>;
  onJournalAdded?: () => void;
}

export function PipeAffairePlacementSection({
  pipe,
  timeline,
  onJournalAdded,
}: PipeAffairePlacementSectionProps) {
  const [addingKind, setAddingKind] = useState<PlacementPartenaireJournalKind | null>(null);
  const [contenu, setContenu] = useState("");
  const [saving, setSaving] = useState(false);
  const isVersementChild = pipe.parent_pipe_id != null && pipe.parent_pipe_id > 0;

  const openAdd = (kind: PlacementPartenaireJournalKind) => {
    setAddingKind(kind);
    setContenu("");
  };

  const cancelAdd = () => {
    setAddingKind(null);
    setContenu("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingKind) return;
    setSaving(true);
    try {
      await journalAffairePartenairePlacement({
        timeline,
        pipe,
        journalEntryType: addingKind,
        contenu,
      });
      toast.success(
        addingKind === "VERSEMENT"
          ? "Versement partenaire — en attente Stellium"
          : "Souscription partenaire — en attente Stellium"
      );
      cancelAdd();
      onJournalAdded?.();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/15 p-4">
      <div>
        <p className="text-sm font-medium">Envoi partenaire (Box Placement)</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          Journalisez l&apos;envoi chez Stellium pour suivre non-conformité, conforme et email
          client. L&apos;email part uniquement si l&apos;opération est déclarée ici.
        </p>
        {isVersementChild && (
          <p className="text-xs text-muted-foreground mt-1">
            Affaire versement : le versement est suivi à la création ; ajoutez la souscription
            partenaire quand le dossier part chez Stellium.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {!isVersementChild && (
          <Button
            type="button"
            variant={addingKind === "VERSEMENT" ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => openAdd("VERSEMENT")}
            disabled={saving}
          >
            <Banknote className="h-3.5 w-3.5" />
            Versement partenaire
          </Button>
        )}
        <Button
          type="button"
          variant={addingKind === "SOUSCRIPTION" ? "secondary" : "outline"}
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => openAdd("SOUSCRIPTION")}
          disabled={saving}
        >
          <FileCheck className="h-3.5 w-3.5" />
          Souscription partenaire
        </Button>
      </div>

      {addingKind && (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <DictationTextarea
            label="Détail (optionnel)"
            value={contenu}
            onChange={setContenu}
            rows={2}
            placeholder="Produit, montant, contexte…"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancelAdd}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Enregistrement…" : "Confirmer l'envoi partenaire"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
