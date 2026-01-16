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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import type { ExtractedData } from "@/lib/pdf";

interface ExtractedDataPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedData: ExtractedData;
  onApply: (data: ExtractedData) => void;
  onIgnore: () => void;
}

export function ExtractedDataPreview({
  open,
  onOpenChange,
  extractedData,
  onApply,
  onIgnore,
}: ExtractedDataPreviewProps) {
  const [formData, setFormData] = useState<ExtractedData>(extractedData);

  const handleApply = () => {
    onApply(formData);
    onOpenChange(false);
  };

  const handleIgnore = () => {
    onIgnore();
    onOpenChange(false);
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return "text-gray-500";
    if (confidence >= 80) return "text-green-600";
    if (confidence >= 60) return "text-orange-500";
    return "text-red-500";
  };

  const getConfidenceIcon = (confidence?: number) => {
    if (!confidence) return <AlertCircle className="h-5 w-5" />;
    if (confidence >= 80)
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    return <AlertCircle className="h-5 w-5 text-orange-500" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-primary" />
            Données extraites du PDF
          </DialogTitle>
          <DialogDescription>
            Vérifiez et corrigez les informations avant de les appliquer
          </DialogDescription>
        </DialogHeader>

        {/* Score de confiance */}
        <div
          className={`flex items-center gap-2 p-3 rounded-lg border ${
            extractedData.confidence && extractedData.confidence >= 80
              ? "bg-green-50 border-green-200"
              : "bg-orange-50 border-orange-200"
          }`}
        >
          {getConfidenceIcon(extractedData.confidence)}
          <div className="flex-1">
            <div className="font-medium">
              Confiance :{" "}
              <span className={getConfidenceColor(extractedData.confidence)}>
                {extractedData.confidence || 0}%
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {extractedData.confidence && extractedData.confidence >= 80
                ? "Excellente extraction - Vérifiez quand même les données"
                : "Extraction partielle - Vérifiez attentivement les données"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Civilité */}
          {formData.civilite !== undefined && (
            <div className="space-y-2">
              <Label htmlFor="civilite">Civilité</Label>
              <Select
                value={formData.civilite}
                onValueChange={(value) =>
                  setFormData({ ...formData, civilite: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Monsieur</SelectItem>
                  <SelectItem value="MME">Madame</SelectItem>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Nom */}
          {formData.nom !== undefined && (
            <div className="space-y-2">
              <Label htmlFor="nom">Nom</Label>
              <Input
                id="nom"
                value={formData.nom || ""}
                onChange={(e) =>
                  setFormData({ ...formData, nom: e.target.value })
                }
              />
            </div>
          )}

          {/* Prénom */}
          {formData.prenom !== undefined && (
            <div className="space-y-2">
              <Label htmlFor="prenom">Prénom</Label>
              <Input
                id="prenom"
                value={formData.prenom || ""}
                onChange={(e) =>
                  setFormData({ ...formData, prenom: e.target.value })
                }
              />
            </div>
          )}

          {/* Date de naissance */}
          {formData.dateNaissance !== undefined && (
            <div className="space-y-2">
              <Label htmlFor="dateNaissance">Date de naissance</Label>
              <Input
                id="dateNaissance"
                value={formData.dateNaissance || ""}
                onChange={(e) =>
                  setFormData({ ...formData, dateNaissance: e.target.value })
                }
                placeholder="JJ/MM/AAAA"
              />
            </div>
          )}

          {/* Email */}
          {formData.email !== undefined && (
            <div className="space-y-2 md:col-span-2">
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
          )}

          {/* Téléphone */}
          {formData.telephone !== undefined && (
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
          )}

          {/* Profession */}
          {formData.profession !== undefined && (
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
          )}

          {/* Adresse */}
          {formData.adresse !== undefined && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="adresse">Adresse</Label>
              <Input
                id="adresse"
                value={formData.adresse || ""}
                onChange={(e) =>
                  setFormData({ ...formData, adresse: e.target.value })
                }
              />
            </div>
          )}

          {/* Code postal */}
          {formData.codePostal !== undefined && (
            <div className="space-y-2">
              <Label htmlFor="codePostal">Code postal</Label>
              <Input
                id="codePostal"
                value={formData.codePostal || ""}
                onChange={(e) =>
                  setFormData({ ...formData, codePostal: e.target.value })
                }
              />
            </div>
          )}

          {/* Ville */}
          {formData.ville !== undefined && (
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
          )}

          {/* Situation familiale */}
          {formData.situationFamiliale !== undefined && (
            <div className="space-y-2">
              <Label htmlFor="situationFamiliale">Situation familiale</Label>
              <Select
                value={formData.situationFamiliale}
                onValueChange={(value) =>
                  setFormData({ ...formData, situationFamiliale: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CELIBATAIRE">Célibataire</SelectItem>
                  <SelectItem value="MARIE">Marié(e)</SelectItem>
                  <SelectItem value="PACSE">Pacsé(e)</SelectItem>
                  <SelectItem value="DIVORCE">Divorcé(e)</SelectItem>
                  <SelectItem value="VEUF">Veuf(ve)</SelectItem>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Alerte si conjoint détecté */}
        {formData.conjoint && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              <div className="font-medium text-blue-900">
                Conjoint détecté dans le document
              </div>
            </div>
            <div className="text-sm text-blue-800">
              {formData.conjoint.nom && formData.conjoint.prenom
                ? `${formData.conjoint.civilite || ""} ${
                    formData.conjoint.prenom
                  } ${formData.conjoint.nom}`
                : "Informations partielles du conjoint détectées"}
            </div>
            <div className="text-xs text-blue-700 mt-1">
              Cette fonctionnalité sera développée prochainement
            </div>
          </div>
        )}

        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={handleIgnore}>
            Ignorer
          </Button>
          <Button type="button" onClick={handleApply}>
            Appliquer les données
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
