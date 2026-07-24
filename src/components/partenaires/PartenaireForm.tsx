import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPartenaire, updatePartenaire, type NewPartenaire, type Partenaire } from "@/lib/api/tauri-partenaires";
import {
  nestedStackedDialogClass,
  nestedStackedOutsideHandlers,
  nestedStackedPortalLayer,
} from "@/lib/ui/nested-stacked-dialog";
import {
  stopWheelPropagation,
  useLockAppMainScroll,
} from "@/lib/ui/nested-sheet-scroll";
import { PortalLayerProvider } from "@/lib/ui/portal-layer-context";
import { TeamLockBanner } from "@/components/team/TeamLockBanner";
import { useTeamFormRecordLock } from "@/hooks/useTeamFormRecordLock";

interface PartenaireFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partenaire?: Partenaire | null;
  /** Pré-sélection du type à la création (ex. depuis un placement). */
  defaultTypePartenaire?: string;
  onSuccess: (partenaireId?: number) => void;
  nestedSheet?: boolean;
}

export function PartenaireForm({
  open,
  onOpenChange,
  partenaire,
  defaultTypePartenaire,
  onSuccess,
  nestedSheet = false,
}: PartenaireFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<NewPartenaire>({
    type_partenaire: partenaire?.type_partenaire || "SOCIETE_GESTION_SCPI",
    raison_sociale: partenaire?.raison_sociale || "",
  });
  const teamLock = useTeamFormRecordLock({
    open,
    onOpenChange,
    entityType: "partenaire",
    entityId: partenaire?.id,
  });

  useLockAppMainScroll(open && nestedSheet);

  // Réinitialiser le formulaire quand on ouvre/ferme ou change de partenaire
  useEffect(() => {
    if (open) {
      setFormData({
        type_partenaire:
          partenaire?.type_partenaire ||
          defaultTypePartenaire ||
          "SOCIETE_GESTION_SCPI",
        raison_sociale: partenaire?.raison_sociale || "",
      });
    }
  }, [open, partenaire, defaultTypePartenaire]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamLock.ready) return;
    setLoading(true);

    try {
      if (partenaire) {
        await updatePartenaire(partenaire.id, formData);
        onSuccess(partenaire.id);
      } else {
        const created = await createPartenaire(formData);
        onSuccess(created.id);
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving partenaire:", error);
      alert("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={!nestedSheet}>
      <DialogContent
        hideOverlay={nestedSheet}
        className={nestedStackedDialogClass("max-w-md", nestedSheet, "deep")}
        onWheel={nestedSheet ? stopWheelPropagation : undefined}
        {...nestedStackedOutsideHandlers(nestedSheet)}
      >
        <PortalLayerProvider layer={nestedStackedPortalLayer(nestedSheet, "deep")}>
        <DialogHeader>
          <DialogTitle>
            {partenaire ? "Modifier le partenaire" : "Nouveau partenaire"}
          </DialogTitle>
          <DialogDescription>
            Ajoutez un assureur, une société de gestion ou un promoteur
          </DialogDescription>
        </DialogHeader>
        <TeamLockBanner
          heldBy={teamLock.heldBy}
          loading={teamLock.loading}
          message={teamLock.error}
        />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="raison_sociale">Nom *</Label>
            <Input
              id="raison_sociale"
              value={formData.raison_sociale}
              onChange={(e) =>
                setFormData({ ...formData, raison_sociale: e.target.value })
              }
              placeholder="Ex: Corum, Generali, Nexity..."
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type_partenaire">Type *</Label>
            <Select
              value={formData.type_partenaire}
              onValueChange={(value) =>
                setFormData({ ...formData, type_partenaire: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SOCIETE_GESTION_SCPI">Société de Gestion SCPI</SelectItem>
                <SelectItem value="SOCIETE_GESTION_FIP">Société de Gestion FIP/FCPI/FCPR</SelectItem>
                <SelectItem value="ASSUREUR">Assureur</SelectItem>
                <SelectItem value="PROMOTEUR">Promoteur</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading || !teamLock.ready}>
              {loading ? "Enregistrement..." : partenaire ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
        </PortalLayerProvider>
      </DialogContent>
    </Dialog>
  );
}
