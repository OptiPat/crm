// Onglet « Couple / foyer » de la fiche contact (présentationnel).
// Extrait de ContactDetail pour alléger le composant : reçoit ses données et
// callbacks par props, ne gère aucun état ni chargement.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  Briefcase,
  Home,
  Plus,
  UserCheck,
  UserPlus,
  Users2,
  UserX,
} from "lucide-react";
import { type Contact } from "@/lib/api/tauri-contacts";
import { type Foyer } from "@/lib/api/tauri-foyers";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";

interface ContactDetailFoyerTabProps {
  contact: Contact;
  foyer: Foyer | null;
  loadingFoyer: boolean;
  foyerPatrimoine: number;
  foyerMembers: Contact[];
  prescripteur: Contact | null;
  loadingPrescripteur: boolean;
  parrain: Contact | null;
  loadingParrain: boolean;
  filleuls: Contact[];
  loadingFilleuls: boolean;
  onOpenLinkedContact: (contact: Contact) => void;
  onOpenMemberDetail: (member: Contact) => void;
  onDissocierFoyer: () => void;
  onAddFoyerMember: () => void;
  onCreateFoyer: () => void;
}

const roleFoyerLabel = (role?: string | null): string =>
  role === "DECLARANT_1"
    ? "Déclarant 1"
    : role === "DECLARANT_2"
      ? "Déclarant 2"
      : role === "ENFANT"
        ? "Enfant"
        : "Autre membre";

export function ContactDetailFoyerTab({
  contact,
  foyer,
  loadingFoyer,
  foyerPatrimoine,
  foyerMembers,
  prescripteur,
  loadingPrescripteur,
  parrain,
  loadingParrain,
  filleuls,
  loadingFilleuls,
  onOpenLinkedContact,
  onOpenMemberDetail,
  onDissocierFoyer,
  onAddFoyerMember,
  onCreateFoyer,
}: ContactDetailFoyerTabProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Home className="h-5 w-5" />
            Couple / foyer
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingFoyer ? (
            <div className="text-sm text-muted-foreground">Chargement...</div>
          ) : foyer ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-lg">{foyer.nom}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {contact.prenom} {contact.nom}
                    {contact.role_foyer && <> · {roleFoyerLabel(contact.role_foyer)}</>}
                  </p>
                  {foyerPatrimoine > 0 && (
                    <p className="text-sm text-primary font-medium mt-2">
                      Patrimoine commun : {foyerPatrimoine.toLocaleString("fr-FR")} €
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button size="sm" className="gap-1.5" onClick={onAddFoyerMember}>
                    <UserPlus className="h-4 w-4" />
                    Ajouter un membre
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onDissocierFoyer}>
                    Retirer du foyer
                  </Button>
                </div>
              </div>
              {foyerMembers.length > 0 ? (
                <div>
                  <h4 className="text-sm font-medium mb-2">Autres membres du foyer</h4>
                  <div className="space-y-2">
                    {foyerMembers.map((member) => (
                      <div
                        key={member.id}
                        className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => onOpenMemberDetail(member)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">
                              {member.prenom} {member.nom}
                            </p>
                            {member.role_foyer && (
                              <p className="text-xs text-muted-foreground">
                                {roleFoyerLabel(member.role_foyer)}
                              </p>
                            )}
                          </div>
                          <Badge className="bg-blue-50 text-blue-700">{member.categorie}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Seul(e) dans ce foyer pour l’instant — ajoutez conjoint, enfant ou co-titulaire.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-primary/25 bg-primary/5 p-4 space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-foreground">
                  Regroupez ce contact avec son conjoint, un co-titulaire ou d’autres membres du
                  même foyer fiscal — <strong>même si les noms de famille diffèrent</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  Ce n’est pas la page « Familles » du menu, qui classe automatiquement par nom de
                  famille.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <Button className="gap-2 shrink-0" onClick={onAddFoyerMember}>
                  <UserPlus className="h-4 w-4" />
                  Regrouper avec un autre contact
                </Button>
                <div className="flex flex-col gap-1">
                  <Button variant="outline" className="gap-2" onClick={onCreateFoyer}>
                    <Plus className="h-4 w-4" />
                    Créer un foyer vide, puis ajouter des membres
                  </Button>
                  <p className="text-xs text-muted-foreground px-0.5">
                    Conjoint + enfants en une fois
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {contact.prescripteur_id != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prescripteur</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPrescripteur ? (
              <div className="text-sm text-muted-foreground">Chargement…</div>
            ) : prescripteur ? (
              <div
                className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                onClick={() => onOpenLinkedContact(prescripteur)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenLinkedContact(prescripteur);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <p className="font-medium">
                  {prescripteur.prenom} {prescripteur.nom}
                </p>
                {prescripteur.email && (
                  <p className="text-sm text-muted-foreground">{prescripteur.email}</p>
                )}
                <p className="text-xs text-primary mt-1">Voir la fiche prescripteur</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Prescripteur introuvable (ID: {contact.prescripteur_id})
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {(contact.filleul_categorie === "FILLEUL" ||
        contact.filleul_categorie === "PROSPECT_FILLEUL" ||
        contact.filleul_categorie === "SUSPECT_FILLEUL" ||
        contact.filleul_categorie === "FILLEUL_DESINSCRIT" ||
        contact.parrain_id) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users2 className="h-5 w-5" />
              Parrain
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingParrain ? (
              <div className="text-sm text-muted-foreground">Chargement...</div>
            ) : parrain ? (
              <div
                className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                onClick={() => onOpenLinkedContact(parrain)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenLinkedContact(parrain);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {parrain.prenom} {parrain.nom}
                    </p>
                    {parrain.email && (
                      <p className="text-sm text-muted-foreground">{parrain.email}</p>
                    )}
                    {parrain.telephone && (
                      <p className="text-sm text-muted-foreground">{parrain.telephone}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {parrain.categorie === "CLIENT" && (
                      <Badge className="bg-green-100 text-green-800 gap-1">
                        <Briefcase className="h-3 w-3 shrink-0" aria-hidden />
                        Client
                      </Badge>
                    )}
                    {parrain.filleul_categorie === "FILLEUL_DESINSCRIT" ? (
                      <Badge className="bg-red-50 text-red-700 gap-1">
                        <UserX className="h-3 w-3 shrink-0" aria-hidden />
                        Filleul désinscrit
                      </Badge>
                    ) : parrain.filleul_categorie ? (
                      <Badge className="bg-emerald-50 text-emerald-700 gap-1">
                        <UserCheck className="h-3 w-3 shrink-0" aria-hidden />
                        Filleul inscrit
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : contact.parrain_id ? (
              <div className="flex items-center gap-2 text-sm text-orange-600">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                Parrain introuvable (ID: {contact.parrain_id})
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Aucun parrain renseigné</div>
            )}
          </CardContent>
        </Card>
      )}

      {filleuls.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users2 className="h-5 w-5" />
                Mes filleuls ({filleuls.length})
              </CardTitle>
              <div className="text-sm text-muted-foreground">
                {filleuls.filter((f) => f.filleul_categorie === "FILLEUL").length} actif
                {filleuls.filter((f) => f.filleul_categorie === "FILLEUL").length > 1 ? "s" : ""} •{" "}
                {filleuls.filter((f) => f.filleul_categorie === "PROSPECT_FILLEUL").length} prospect
                {filleuls.filter((f) => f.filleul_categorie === "PROSPECT_FILLEUL").length > 1
                  ? "s"
                  : ""}{" "}
                •{" "}
                {filleuls.filter((f) => f.filleul_categorie === "FILLEUL_DESINSCRIT").length}{" "}
                désinscrit
                {filleuls.filter((f) => f.filleul_categorie === "FILLEUL_DESINSCRIT").length > 1
                  ? "s"
                  : ""}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingFilleuls ? (
              <div className="text-sm text-muted-foreground">Chargement...</div>
            ) : (
              <div className="space-y-2">
                {filleuls.map((filleul) => (
                  <div
                    key={filleul.id}
                    className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => onOpenLinkedContact(filleul)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenLinkedContact(filleul);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {filleul.prenom} {filleul.nom}
                        </p>
                        {filleul.date_dernier_contact_filleul && (
                          <p className="text-xs text-muted-foreground">
                            Dernier suivi : {formatCalendarDateFr(filleul.date_dernier_contact_filleul)}
                          </p>
                        )}
                      </div>
                      <Badge
                        className={
                          filleul.filleul_categorie === "FILLEUL"
                            ? "bg-purple-50 text-purple-700"
                            : filleul.filleul_categorie === "PROSPECT_FILLEUL"
                              ? "bg-cyan-50 text-cyan-700"
                              : filleul.filleul_categorie === "SUSPECT_FILLEUL"
                                ? "bg-orange-50 text-orange-700"
                                : "bg-gray-50 text-gray-700"
                        }
                      >
                        {filleul.filleul_categorie === "FILLEUL" && "Filleul"}
                        {filleul.filleul_categorie === "PROSPECT_FILLEUL" && "Prospect"}
                        {filleul.filleul_categorie === "SUSPECT_FILLEUL" && "Suspect"}
                        {filleul.filleul_categorie === "FILLEUL_DESINSCRIT" && "Désinscrit"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
