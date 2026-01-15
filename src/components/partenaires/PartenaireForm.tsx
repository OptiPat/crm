import { useState } from "react";
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
    type_partenaire: partenaire?.type_partenaire || "NOTAIRE",
    raison_sociale: partenaire?.raison_sociale || "",
    nom_contact: partenaire?.nom_contact || "",
    prenom_contact: partenaire?.prenom_contact || "",
    email: partenaire?.email || "",
    telephone: partenaire?.telephone || "",
    adresse: partenaire?.adresse || "",
    code_postal: partenaire?.code_postal || "",
    ville: partenaire?.ville || "",
    specialite: partenaire?.specialite || "",
    zone_geo: partenaire?.zone_geo || "",
    niveau_collaboration: partenaire?.niveau_collaboration || "OCCASIONNEL",
    notes: partenaire?.notes || "",
  });

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
      // Réinitialiser le formulaire
      setFormData({
        type_partenaire: "NOTAIRE",
        raison_sociale: "",
        nom_contact: "",
        prenom_contact: "",
        email: "",
        telephone: "",
        adresse: "",
        code_postal: "",
        ville: "",
        specialite: "",
        zone_geo: "",
        niveau_collaboration: "OCCASIONNEL",
        notes: "",
      });
    } catch (error) {
      console.error("Error saving partenaire:", error);
      alert("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {partenaire ? "Modifier le partenaire" : "Nouveau partenaire"}
          </DialogTitle>
          <DialogDescription>
            Remplissez les informations du partenaire
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type et Raison sociale */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type_partenaire">Type de partenaire *</Label>
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
                  <SelectItem value="NOTAIRE">Notaire</SelectItem>
                  <SelectItem value="AVOCAT">Avocat</SelectItem>
                  <SelectItem value="EXPERT_COMPTABLE">Expert-comptable</SelectItem>
                  <SelectItem value="BANQUIER">Banquier</SelectItem>
                  <SelectItem value="ASSUREUR">Assureur</SelectItem>
                  <SelectItem value="COURTIER">Courtier</SelectItem>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="niveau_collaboration">Niveau de collaboration *</Label>
              <Select
                value={formData.niveau_collaboration}
                onValueChange={(value) =>
                  setFormData({ ...formData, niveau_collaboration: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OCCASIONNEL">Occasionnel</SelectItem>
                  <SelectItem value="REGULIER">Régulier</SelectItem>
                  <SelectItem value="PRIVILEGIE">Privilégié</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Raison sociale */}
          <div className="space-y-2">
            <Label htmlFor="raison_sociale">Raison sociale / Cabinet *</Label>
            <Input
              id="raison_sociale"
              value={formData.raison_sociale}
              onChange={(e) =>
                setFormData({ ...formData, raison_sociale: e.target.value })
              }
              placeholder="Ex: Étude NOM2 & Associés"
              required
            />
          </div>

          {/* Nom et Prénom du contact */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nom_contact">Nom du contact</Label>
              <Input
                id="nom_contact"
                value={formData.nom_contact || ""}
                onChange={(e) =>
                  setFormData({ ...formData, nom_contact: e.target.value })
                }
                placeholder="NOM2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prenom_contact">Prénom du contact</Label>
              <Input
                id="prenom_contact"
                value={formData.prenom_contact || ""}
                onChange={(e) =>
                  setFormData({ ...formData, prenom_contact: e.target.value })
                }
                placeholder="Jean"
              />
            </div>
          </div>

          {/* Email et Téléphone */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ""}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="contact@cabinet.fr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telephone">Téléphone</Label>
              <Input
                id="telephone"
                value={formData.telephone || ""}
                onChange={(e) =>
                  setFormData({ ...formData, telephone: e.target.value })
                }
                placeholder="01 23 45 67 89"
              />
            </div>
          </div>

          {/* Adresse */}
          <div className="space-y-2">
            <Label htmlFor="adresse">Adresse</Label>
            <Input
              id="adresse"
              value={formData.adresse || ""}
              onChange={(e) =>
                setFormData({ ...formData, adresse: e.target.value })
              }
              placeholder="12 rue de la République"
            />
          </div>

          {/* Code postal et Ville */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code_postal">Code postal</Label>
              <Input
                id="code_postal"
                value={formData.code_postal || ""}
                onChange={(e) =>
                  setFormData({ ...formData, code_postal: e.target.value })
                }
                placeholder="75001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ville">Ville</Label>
              <Input
                id="ville"
                value={formData.ville || ""}
                onChange={(e) =>
                  setFormData({ ...formData, ville: e.target.value })
                }
                placeholder="Paris"
              />
            </div>
          </div>

          {/* Spécialité et Zone géographique */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="specialite">Spécialité</Label>
              <Input
                id="specialite"
                value={formData.specialite || ""}
                onChange={(e) =>
                  setFormData({ ...formData, specialite: e.target.value })
                }
                placeholder="Ex: Droit de la famille"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="zone_geo">Zone géographique</Label>
              <Input
                id="zone_geo"
                value={formData.zone_geo || ""}
                onChange={(e) =>
                  setFormData({ ...formData, zone_geo: e.target.value })
                }
                placeholder="Ex: Île-de-France"
              />
            </div>
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
              placeholder="Informations complémentaires..."
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
              {loading ? "Enregistrement..." : partenaire ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
