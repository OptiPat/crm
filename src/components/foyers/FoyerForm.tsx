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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createFoyer, updateFoyer, type NewFoyer, type Foyer } from "@/lib/api/tauri-foyers";
import { getFoyerTypeLabel } from "@/lib/foyers/foyer-display";
import { pickFiscal, propagateFiscalToFoyerMembers } from "@/lib/foyers/foyer-fiscal-sync";
import { toast } from "sonner";

const FOYER_TYPE_OPTIONS = [
  "CELIBATAIRE",
  "COUPLE",
  "FAMILLE",
  "DIVORCE",
  "VEUF",
] as const;

interface FoyerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foyer?: Foyer | null;
  onSuccess: () => void;
}

export function FoyerForm({ open, onOpenChange, foyer, onSuccess }: FoyerFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<NewFoyer>({
    nom: "",
    type_foyer: "COUPLE",
    nombre_parts_fiscales: undefined,
    tranche_imposition: undefined,
    revenu_fiscal_reference: undefined,
    ir_net_a_payer: undefined,
    situation_patrimoniale: "",
    objectifs_patrimoniaux: "",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setFormData({
      nom: foyer?.nom || "",
      type_foyer: foyer?.type_foyer || "COUPLE",
      nombre_parts_fiscales: foyer?.nombre_parts_fiscales || undefined,
      tranche_imposition: foyer?.tranche_imposition || undefined,
      revenu_fiscal_reference: foyer?.revenu_fiscal_reference || undefined,
      ir_net_a_payer: foyer?.ir_net_a_payer || undefined,
      situation_patrimoniale: foyer?.situation_patrimoniale || "",
      objectifs_patrimoniaux: foyer?.objectifs_patrimoniaux || "",
      notes: foyer?.notes || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- réinitialise à l'ouverture / changement de foyer
  }, [open, foyer?.id, foyer?.updated_at]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (foyer) {
        await updateFoyer(foyer.id, formData);
        // Synchroniser la fiscalité sur les fiches contacts des membres.
        await propagateFiscalToFoyerMembers(foyer.id, pickFiscal(formData));
      } else {
        await createFoyer(formData);
      }
      onSuccess();
      onOpenChange(false);
      // Réinitialiser le formulaire
      setFormData({
        nom: "",
        type_foyer: "COUPLE",
        nombre_parts_fiscales: undefined,
        tranche_imposition: undefined,
        revenu_fiscal_reference: undefined,
        ir_net_a_payer: undefined,
        situation_patrimoniale: "",
        objectifs_patrimoniaux: "",
        notes: "",
      });
    } catch (error) {
      console.error("Error saving foyer:", error);
      toast.error("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {foyer ? "Modifier le foyer" : "Nouveau foyer"}
          </DialogTitle>
          <DialogDescription>
            Remplissez les informations du foyer fiscal
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom et Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nom">Nom du foyer *</Label>
              <Input
                id="nom"
                value={formData.nom}
                onChange={(e) =>
                  setFormData({ ...formData, nom: e.target.value })
                }
                placeholder="Ex. Foyer Martin - Dupont"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type_foyer">Type de foyer *</Label>
              <Select
                value={formData.type_foyer}
                onValueChange={(value) =>
                  setFormData({ ...formData, type_foyer: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOYER_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getFoyerTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Parts fiscales et Tranche */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nombre_parts_fiscales">Nombre de parts fiscales</Label>
              <Input
                id="nombre_parts_fiscales"
                type="number"
                step="0.5"
                value={formData.nombre_parts_fiscales || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    nombre_parts_fiscales: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
                placeholder="Ex: 2.5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tranche_imposition">Tranche d'imposition</Label>
              <Select
                value={formData.tranche_imposition || ""}
                onValueChange={(value) =>
                  setFormData({ ...formData, tranche_imposition: value || undefined })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0%">0%</SelectItem>
                  <SelectItem value="11%">11%</SelectItem>
                  <SelectItem value="30%">30%</SelectItem>
                  <SelectItem value="41%">41%</SelectItem>
                  <SelectItem value="45%">45%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Revenu brut global */}
          <div className="space-y-2">
            <Label htmlFor="revenu_fiscal_reference">Revenu brut global (€)</Label>
            <Input
              id="revenu_fiscal_reference"
              type="number"
              value={formData.revenu_fiscal_reference || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  revenu_fiscal_reference: e.target.value ? parseFloat(e.target.value) : undefined,
                })
              }
              placeholder="Ex: 65000"
            />
          </div>

          {/* IR net à payer */}
          <div className="space-y-2">
            <Label htmlFor="ir_net_a_payer">IR net à payer (€)</Label>
            <Input
              id="ir_net_a_payer"
              type="number"
              value={formData.ir_net_a_payer || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  ir_net_a_payer: e.target.value ? parseFloat(e.target.value) : undefined,
                })
              }
              placeholder="Ex: 4350"
            />
          </div>

          {/* Situation patrimoniale */}
          <div className="space-y-2">
            <Label htmlFor="situation_patrimoniale">Situation patrimoniale</Label>
            <Textarea
              id="situation_patrimoniale"
              value={formData.situation_patrimoniale || ""}
              onChange={(e) =>
                setFormData({ ...formData, situation_patrimoniale: e.target.value })
              }
              placeholder="Résidence principale, placements, assurance-vie..."
              rows={3}
            />
          </div>

          {/* Objectifs patrimoniaux */}
          <div className="space-y-2">
            <Label htmlFor="objectifs_patrimoniaux">Objectifs patrimoniaux</Label>
            <Textarea
              id="objectifs_patrimoniaux"
              value={formData.objectifs_patrimoniaux || ""}
              onChange={(e) =>
                setFormData({ ...formData, objectifs_patrimoniaux: e.target.value })
              }
              placeholder="Retraite, transmission, protection..."
              rows={3}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : foyer ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
