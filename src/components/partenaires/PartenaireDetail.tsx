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
  Mail,
  Phone,
  MapPin,
  Briefcase,
  FileText,
  Edit,
  Trash2,
  User,
} from "lucide-react";
import { type Partenaire } from "@/lib/api/tauri-partenaires";
import { PartenaireForm } from "./PartenaireForm";

interface PartenaireDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partenaire: Partenaire | null;
  onDelete: (id: number) => void;
  onUpdate: () => void;
}

export function PartenaireDetail({
  open,
  onOpenChange,
  partenaire,
  onDelete,
  onUpdate,
}: PartenaireDetailProps) {
  const [showEditForm, setShowEditForm] = useState(false);

  if (!partenaire) return null;

  const getTypeColor = (type: string) => {
    switch (type) {
      case "NOTAIRE":
        return "bg-blue-100 text-blue-800";
      case "AVOCAT":
        return "bg-purple-100 text-purple-800";
      case "EXPERT_COMPTABLE":
        return "bg-green-100 text-green-800";
      case "BANQUIER":
        return "bg-cyan-100 text-cyan-800";
      case "ASSUREUR":
        return "bg-orange-100 text-orange-800";
      case "COURTIER":
        return "bg-pink-100 text-pink-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getNiveauColor = (niveau: string) => {
    switch (niveau) {
      case "PRIVILEGIE":
        return "bg-green-100 text-green-800";
      case "REGULIER":
        return "bg-blue-100 text-blue-800";
      case "OCCASIONNEL":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-2xl">
                  {partenaire.raison_sociale}
                </DialogTitle>
                <DialogDescription className="flex gap-2 mt-2">
                  <Badge className={getTypeColor(partenaire.type_partenaire)}>
                    {partenaire.type_partenaire}
                  </Badge>
                  {partenaire.niveau_collaboration && (
                    <Badge className={getNiveauColor(partenaire.niveau_collaboration)}>
                      {partenaire.niveau_collaboration}
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
            {/* Personne de contact */}
            {(partenaire.nom_contact || partenaire.prenom_contact) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personne de contact
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-semibold">
                    {partenaire.prenom_contact} {partenaire.nom_contact}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Informations de contact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Coordonnées
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {partenaire.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`mailto:${partenaire.email}`}
                      className="text-primary hover:underline"
                    >
                      {partenaire.email}
                    </a>
                  </div>
                )}
                {partenaire.telephone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`tel:${partenaire.telephone}`}
                      className="text-primary hover:underline"
                    >
                      {partenaire.telephone}
                    </a>
                  </div>
                )}
                {(partenaire.adresse || partenaire.ville) && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      {partenaire.adresse && <div>{partenaire.adresse}</div>}
                      {(partenaire.code_postal || partenaire.ville) && (
                        <div>
                          {partenaire.code_postal} {partenaire.ville}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activité professionnelle */}
            {(partenaire.specialite || partenaire.zone_geo) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Activité professionnelle
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {partenaire.specialite && (
                    <div>
                      <span className="text-sm text-muted-foreground">Spécialité: </span>
                      <span className="font-medium">{partenaire.specialite}</span>
                    </div>
                  )}
                  {partenaire.zone_geo && (
                    <div>
                      <span className="text-sm text-muted-foreground">Zone géographique: </span>
                      <span className="font-medium">{partenaire.zone_geo}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {partenaire.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{partenaire.notes}</p>
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
                  {new Date(partenaire.created_at * 1000).toLocaleString("fr-FR")}
                </div>
                <div>
                  Mis à jour le:{" "}
                  {new Date(partenaire.updated_at * 1000).toLocaleString("fr-FR")}
                </div>
              </CardContent>
            </Card>
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
