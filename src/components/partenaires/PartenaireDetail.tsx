import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Building2, Shield, Home } from "lucide-react";
import { type Partenaire } from "@/lib/api/tauri-partenaires";
import { PartenaireForm } from "./PartenaireForm";

interface PartenaireDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partenaire: Partenaire | null;
  onDelete: (id: number) => void;
  onUpdate: () => void;
}

// Helper pour afficher le type de partenaire
const getTypeInfo = (type: string) => {
  switch (type) {
    case "SOCIETE_GESTION_SCPI":
    case "SOCIETE_GESTION": // Rétrocompatibilité
      return { label: "Société de Gestion SCPI", icon: Building2, color: "bg-blue-100 text-blue-800" };
    case "SOCIETE_GESTION_FIP":
      return { label: "Société de Gestion FIP/FCPI/FCPR", icon: Building2, color: "bg-indigo-100 text-indigo-800" };
    case "ASSUREUR":
      return { label: "Assureur", icon: Shield, color: "bg-green-100 text-green-800" };
    case "PROMOTEUR":
      return { label: "Promoteur", icon: Home, color: "bg-orange-100 text-orange-800" };
    default:
      // Transformer les types inconnus proprement
      const cleanLabel = type
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
      return { label: cleanLabel, icon: Building2, color: "bg-gray-100 text-gray-800" };
  }
};

export function PartenaireDetail({
  open,
  onOpenChange,
  partenaire,
  onDelete,
  onUpdate,
}: PartenaireDetailProps) {
  const [showEditForm, setShowEditForm] = useState(false);

  if (!partenaire) return null;

  const typeInfo = getTypeInfo(partenaire.type_partenaire);
  const TypeIcon = typeInfo.icon;

  const handleDelete = () => {
    if (
      window.confirm(
        `Êtes-vous sûr de vouloir supprimer "${partenaire.raison_sociale}" ?`
      )
    ) {
      onDelete(partenaire.id);
      onOpenChange(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-lg ${typeInfo.color}`}>
                  <TypeIcon className="h-6 w-6" />
                </div>
                <div>
                  <DialogTitle className="text-xl">
                    {partenaire.raison_sociale}
                  </DialogTitle>
                  <DialogDescription className="mt-1">
                    <Badge className={typeInfo.color}>
                      {typeInfo.label}
                    </Badge>
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="flex gap-2 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowEditForm(true)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Modifier
            </Button>
            <Button
              variant="outline"
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="text-xs text-muted-foreground pt-2 border-t">
            Ajouté le {new Date(partenaire.created_at * 1000).toLocaleDateString("fr-FR")}
          </div>
        </DialogContent>
      </Dialog>

      {/* Formulaire de modification */}
      <PartenaireForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        partenaire={partenaire}
        onSuccess={() => {
          onUpdate();
          setShowEditForm(false);
        }}
      />
    </>
  );
}
