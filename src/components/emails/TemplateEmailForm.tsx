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
import {
  createTemplateEmail,
  updateTemplateEmail,
  type NewTemplateEmail,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import { Badge } from "@/components/ui/badge";

interface TemplateEmailFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateEmail | null;
  onSuccess: () => void;
}

export function TemplateEmailForm({
  open,
  onOpenChange,
  template,
  onSuccess,
}: TemplateEmailFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<NewTemplateEmail>({
    nom: "",
    sujet: "",
    corps: "",
    categorie: "AUTRE",
    variables: null,
  });

  useEffect(() => {
    if (template) {
      setFormData({
        nom: template.nom,
        sujet: template.sujet,
        corps: template.corps,
        categorie: template.categorie,
        variables: template.variables,
      });
    } else {
      setFormData({
        nom: "",
        sujet: "",
        corps: "",
        categorie: "AUTRE",
        variables: null,
      });
    }
  }, [template]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (template) {
        await updateTemplateEmail(template.id, formData);
      } else {
        await createTemplateEmail(formData);
      }
      onSuccess();
    } catch (error) {
      console.error("Error saving template:", error);
      alert("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const variablesList = [
    "{{prenom}}",
    "{{nom}}",
    "{{email}}",
    "{{telephone}}",
    "{{lien_calendly}}",
    "{{cgp_nom}}",
    "{{cgp_prenom}}",
    "{{cgp_telephone}}",
    "{{cgp_email}}",
  ];

  const insertVariable = (variable: string) => {
    setFormData({
      ...formData,
      corps: formData.corps + " " + variable,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? "Modifier le template" : "Nouveau template"}
          </DialogTitle>
          <DialogDescription>
            Créez un modèle d'email réutilisable avec des variables dynamiques
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom et Catégorie */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nom">Nom du template *</Label>
              <Input
                id="nom"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Ex: Email de bienvenue"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="categorie">Catégorie *</Label>
              <Select
                value={formData.categorie}
                onValueChange={(value) =>
                  setFormData({ ...formData, categorie: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUIVI_ANNUEL">Suivi annuel</SelectItem>
                  <SelectItem value="ARBITRAGE">Arbitrage</SelectItem>
                  <SelectItem value="FISCALITE">Fiscalité</SelectItem>
                  <SelectItem value="BIENVENUE">Bienvenue</SelectItem>
                  <SelectItem value="RELANCE">Relance</SelectItem>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sujet */}
          <div className="space-y-2">
            <Label htmlFor="sujet">Sujet de l'email *</Label>
            <Input
              id="sujet"
              value={formData.sujet}
              onChange={(e) => setFormData({ ...formData, sujet: e.target.value })}
              placeholder="Ex: Bienvenue {{prenom}} !"
              required
            />
          </div>

          {/* Variables disponibles */}
          <div className="space-y-2">
            <Label>Variables disponibles</Label>
            <div className="flex flex-wrap gap-2">
              {variablesList.map((variable) => (
                <Badge
                  key={variable}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                  onClick={() => insertVariable(variable)}
                >
                  {variable}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cliquez sur une variable pour l'insérer dans le corps de l'email
            </p>
          </div>

          {/* Corps */}
          <div className="space-y-2">
            <Label htmlFor="corps">Corps de l'email *</Label>
            <Textarea
              id="corps"
              value={formData.corps}
              onChange={(e) => setFormData({ ...formData, corps: e.target.value })}
              placeholder="Bonjour {{prenom}},&#10;&#10;Je suis ravi de vous accueillir..."
              rows={12}
              required
            />
          </div>

          {/* Aperçu */}
          <div className="space-y-2">
            <Label>Aperçu</Label>
            <div className="p-4 border border-border rounded-lg bg-muted">
              <p className="text-sm font-medium mb-2">
                <strong>Sujet :</strong> {formData.sujet || "(vide)"}
              </p>
              <div className="text-sm whitespace-pre-wrap">
                {formData.corps || "(vide)"}
              </div>
            </div>
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
              {loading
                ? "Enregistrement..."
                : template
                ? "Modifier"
                : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
