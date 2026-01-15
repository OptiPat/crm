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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  TrendingUp,
  Target,
  FileText,
  Edit,
  Trash2,
  Coins,
} from "lucide-react";
import { type Foyer } from "@/lib/api/tauri-foyers";
import { FoyerForm } from "./FoyerForm";

interface FoyerDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foyer: Foyer | null;
  onDelete: (id: number) => void;
  onUpdate: () => void;
}

export function FoyerDetail({
  open,
  onOpenChange,
  foyer,
  onDelete,
  onUpdate,
}: FoyerDetailProps) {
  const [showEditForm, setShowEditForm] = useState(false);

  if (!foyer) return null;

  const getTypeColor = (type: string) => {
    switch (type) {
      case "COUPLE":
        return "bg-purple-100 text-purple-800";
      case "FAMILLE":
        return "bg-blue-100 text-blue-800";
      case "CELIBATAIRE":
        return "bg-gray-100 text-gray-800";
      case "DIVORCE":
        return "bg-orange-100 text-orange-800";
      case "VEUF":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleDelete = () => {
    if (
      window.confirm(
        `Êtes-vous sûr de vouloir supprimer le foyer "${foyer.nom}" ?`
      )
    ) {
      onDelete(foyer.id);
      onOpenChange(false);
    }
  };

  const formatCurrency = (value?: number) => {
    if (!value) return "Non renseigné";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-2xl">{foyer.nom}</DialogTitle>
                <DialogDescription className="flex gap-2 mt-2">
                  <Badge className={getTypeColor(foyer.type_foyer)}>
                    {foyer.type_foyer}
                  </Badge>
                  {foyer.tranche_imposition && (
                    <Badge variant="outline">
                      TMI {foyer.tranche_imposition}
                    </Badge>
                  )}
                </DialogDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowEditForm(true)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {/* Informations fiscales */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Coins className="h-5 w-5" />
                  Informations fiscales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Parts fiscales
                    </div>
                    <div className="text-lg font-semibold">
                      {foyer.nombre_parts_fiscales || "Non renseigné"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Tranche marginale d'imposition
                    </div>
                    <div className="text-lg font-semibold">
                      {foyer.tranche_imposition || "Non renseigné"}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Revenu fiscal de référence
                  </div>
                  <div className="text-lg font-semibold">
                    {formatCurrency(foyer.revenu_fiscal_reference)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Situation patrimoniale */}
            {foyer.situation_patrimoniale && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Situation patrimoniale
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">
                    {foyer.situation_patrimoniale}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Objectifs patrimoniaux */}
            {foyer.objectifs_patrimoniaux && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Objectifs patrimoniaux
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">
                    {foyer.objectifs_patrimoniaux}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {foyer.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{foyer.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Métadonnées */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informations système</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <div>
                  Créé le:{" "}
                  {new Date(foyer.created_at * 1000).toLocaleString("fr-FR")}
                </div>
                <div>
                  Mis à jour le:{" "}
                  {new Date(foyer.updated_at * 1000).toLocaleString("fr-FR")}
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Formulaire de modification */}
      <FoyerForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        foyer={foyer}
        onSuccess={() => {
          onUpdate();
          setShowEditForm(false);
        }}
      />
    </>
  );
}
