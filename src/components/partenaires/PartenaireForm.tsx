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

interface PartenaireFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partenaire?: Partenaire | null;
  onSuccess: () => void;
}

export function PartenaireForm({ open, onOpenChange, partenaire, onSuccess }: PartenaireFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<NewPartenaire>({
    type_partenaire: partenaire?.type_partenaire || "SOCIETE_GESTION_SCPI",
    raison_sociale: partenaire?.raison_sociale || "",
  });

  // Réinitialiser le formulaire quand on ouvre/ferme ou change de partenaire
  useEffect(() => {
    if (open) {
      setFormData({
        type_partenaire: partenaire?.type_partenaire || "SOCIETE_GESTION_SCPI",
        raison_sociale: partenaire?.raison_sociale || "",
      });
    }
  }, [open, partenaire]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (partenaire) {
        await updatePartenaire(partenaire.id, formData);
      } else {
        await createPartenaire(formData);
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving partenaire:", error);
      alert("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {partenaire ? "Modifier le partenaire" : "Nouveau partenaire"}
          </DialogTitle>
          <DialogDescription>
            Ajoutez un assureur, une société de gestion ou un promoteur
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom du partenaire */}
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

          {/* Type de partenaire */}
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
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : partenaire ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
