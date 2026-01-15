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
import { createContact, updateContact, type NewContact, type Contact } from "@/lib/api/tauri-contacts";

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  onSuccess: () => void;
}

export function ContactForm({ open, onOpenChange, contact, onSuccess }: ContactFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<NewContact>({
    categorie: contact?.categorie || "SUSPECT_CLIENT",
    nom: contact?.nom || "",
    prenom: contact?.prenom || "",
    email: contact?.email || "",
    telephone: contact?.telephone || "",
    adresse: contact?.adresse || "",
    code_postal: contact?.code_postal || "",
    ville: contact?.ville || "",
    date_naissance: contact?.date_naissance || "",
    profession: contact?.profession || "",
    statut_suivi: contact?.statut_suivi || "ACTIF",
    notes: contact?.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (contact) {
        await updateContact(contact.id, formData);
      } else {
        await createContact(formData);
      }
      onSuccess();
      onOpenChange(false);
      // Réinitialiser le formulaire
      setFormData({
        categorie: "SUSPECT_CLIENT",
        nom: "",
        prenom: "",
        email: "",
        telephone: "",
        adresse: "",
        code_postal: "",
        ville: "",
        date_naissance: "",
        profession: "",
        statut_suivi: "ACTIF",
        notes: "",
      });
    } catch (error) {
      console.error("Error saving contact:", error);
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
            {contact ? "Modifier le contact" : "Nouveau contact"}
          </DialogTitle>
          <DialogDescription>
            Remplissez les informations du contact
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Catégorie et Statut */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="categorie">Catégorie *</Label>
              <Select
                value={formData.categorie}
                onValueChange={(value) =>
                  setFormData({ ...formData, categorie: value as any })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT">Client</SelectItem>
                  <SelectItem value="PROSPECT_CLIENT">Prospect client</SelectItem>
                  <SelectItem value="PROSPECT_FILLEUL">Prospect filleul</SelectItem>
                  <SelectItem value="SUSPECT_CLIENT">Suspect client</SelectItem>
                  <SelectItem value="SUSPECT_FILLEUL">Suspect filleul</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="statut_suivi">Statut de suivi *</Label>
              <Select
                value={formData.statut_suivi}
                onValueChange={(value) =>
                  setFormData({ ...formData, statut_suivi: value as any })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIF">Actif</SelectItem>
                  <SelectItem value="EN_PAUSE">En pause</SelectItem>
                  <SelectItem value="ARCHIVE">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Nom et Prénom */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nom">Nom *</Label>
              <Input
                id="nom"
                value={formData.nom}
                onChange={(e) =>
                  setFormData({ ...formData, nom: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prenom">Prénom *</Label>
              <Input
                id="prenom"
                value={formData.prenom}
                onChange={(e) =>
                  setFormData({ ...formData, prenom: e.target.value })
                }
                required
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
              />
            </div>
          </div>

          {/* Date de naissance et Profession */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date_naissance">Date de naissance</Label>
              <Input
                id="date_naissance"
                type="date"
                value={formData.date_naissance || ""}
                onChange={(e) =>
                  setFormData({ ...formData, date_naissance: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profession">Profession</Label>
              <Input
                id="profession"
                value={formData.profession || ""}
                onChange={(e) =>
                  setFormData({ ...formData, profession: e.target.value })
                }
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
              {loading ? "Enregistrement..." : contact ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
