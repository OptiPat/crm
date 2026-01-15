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
  Calendar,
  Briefcase,
  Edit,
  Trash2,
  User,
} from "lucide-react";
import { type Contact } from "@/lib/api/tauri-contacts";
import { ContactForm } from "./ContactForm";

interface ContactDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onDelete: (id: number) => void;
  onUpdate: () => void;
}

export function ContactDetail({
  open,
  onOpenChange,
  contact,
  onDelete,
  onUpdate,
}: ContactDetailProps) {
  const [showEditForm, setShowEditForm] = useState(false);

  if (!contact) return null;

  const getCategorieColor = (categorie: string) => {
    switch (categorie) {
      case "CLIENT":
        return "bg-green-100 text-green-800";
      case "PROSPECT":
        return "bg-blue-100 text-blue-800";
      case "ANCIEN_CLIENT":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case "ACTIF":
        return "bg-green-100 text-green-800";
      case "INACTIF":
        return "bg-red-100 text-red-800";
      case "EN_ATTENTE":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleDelete = () => {
    if (
      window.confirm(
        `Êtes-vous sûr de vouloir supprimer ${contact.prenom} ${contact.nom} ?`
      )
    ) {
      onDelete(contact.id);
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
                  {contact.prenom} {contact.nom}
                </DialogTitle>
                <DialogDescription className="flex gap-2 mt-2">
                  <Badge className={getCategorieColor(contact.categorie)}>
                    {contact.categorie}
                  </Badge>
                  <Badge className={getStatutColor(contact.statut_suivi)}>
                    {contact.statut_suivi}
                  </Badge>
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
            {/* Informations de contact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Informations de contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contact.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-primary hover:underline"
                    >
                      {contact.email}
                    </a>
                  </div>
                )}
                {contact.telephone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`tel:${contact.telephone}`}
                      className="text-primary hover:underline"
                    >
                      {contact.telephone}
                    </a>
                  </div>
                )}
                {(contact.adresse || contact.ville) && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      {contact.adresse && <div>{contact.adresse}</div>}
                      {(contact.code_postal || contact.ville) && (
                        <div>
                          {contact.code_postal} {contact.ville}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Informations personnelles */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Informations personnelles
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contact.date_naissance && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-muted-foreground text-sm">
                        Date de naissance:{" "}
                      </span>
                      {new Date(contact.date_naissance + "T00:00:00").toLocaleDateString(
                        "fr-FR"
                      )}
                    </div>
                  </div>
                )}
                {contact.profession && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-muted-foreground text-sm">
                        Profession:{" "}
                      </span>
                      {contact.profession}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            {contact.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
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
                  {new Date(contact.created_at).toLocaleString("fr-FR")}
                </div>
                <div>
                  Mis à jour le:{" "}
                  {new Date(contact.updated_at).toLocaleString("fr-FR")}
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Formulaire de modification */}
      <ContactForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        contact={contact}
        onSuccess={() => {
          onUpdate();
          setShowEditForm(false);
        }}
      />
    </>
  );
}
