// Onglet « Couple / foyer » de la fiche contact (présentationnel).
// Extrait de ContactDetail pour alléger le composant : reçoit ses données et
// callbacks par props, ne gère aucun état ni chargement.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Briefcase,
  Edit,
  Home,
  Share2,
  UserCheck,
  UserPlus,
  Users2,
  UserX,
} from "lucide-react";
import { type Contact } from "@/lib/api/tauri-contacts";
import { type Foyer } from "@/lib/api/tauri-foyers";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import {
  FOYER_ROLE_OPTIONS,
} from "@/lib/foyers/foyer-utils";
import {
  formatFoyerCurrencyEur,
  getFoyerTypeBadgeClass,
  getFoyerTypeLabel,
} from "@/lib/foyers/foyer-display";
import { cn } from "@/lib/utils";

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
  onEditFoyer: () => void;
  onChangeMemberRole: (member: Contact, role: string) => void;
  onRemoveMemberFromFoyer: (member: Contact) => void;
  onAddFoyerMember: () => void;
  onCreateFoyer: () => void;
  onViewPrescripteurNetwork?: () => void;
  onViewFamilleGroup?: () => void;
  onViewFoyerPage?: () => void;
}

function FoyerMemberRow({
  member,
  isSelf,
  onOpen,
  onRoleChange,
  onRemove,
}: {
  member: Contact;
  isSelf?: boolean;
  onOpen: () => void;
  onRoleChange: (role: string) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center",
        "hover:bg-accent/40 cursor-pointer"
      )}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {member.prenom} {member.nom}
          </p>
          {isSelf && (
            <Badge variant="outline" className="text-[10px] h-5">
              Ce contact
            </Badge>
          )}
        </div>
        {member.email && (
          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
        )}
      </div>
      <div
        className="flex flex-wrap items-center gap-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Select
          value={member.role_foyer || "AUTRE"}
          onValueChange={onRoleChange}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FOYER_ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          {isSelf ? "Quitter" : "Retirer"}
        </Button>
      </div>
    </div>
  );
}

function FoyerFiscalSummary({ foyer }: { foyer: Foyer }) {
  const rfr = formatFoyerCurrencyEur(foyer.revenu_fiscal_reference);
  const irNet = formatFoyerCurrencyEur(foyer.ir_net_a_payer);
  const parts = [
    foyer.nombre_parts_fiscales != null
      ? `${foyer.nombre_parts_fiscales} part${foyer.nombre_parts_fiscales > 1 ? "s" : ""}`
      : null,
    foyer.tranche_imposition ? `TMI ${foyer.tranche_imposition}` : null,
    rfr ? `RBG ${rfr}` : null,
    irNet ? `IR ${irNet}` : null,
  ].filter(Boolean);

  if (parts.length === 0 && !foyer.situation_patrimoniale && !foyer.objectifs_patrimoniaux) {
    return (
      <p className="text-xs text-muted-foreground">
        Informations fiscales non renseignées — utilisez « Modifier le foyer ».
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      {parts.length > 0 && (
        <p className="text-muted-foreground">{parts.join(" · ")}</p>
      )}
      {foyer.situation_patrimoniale && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {foyer.situation_patrimoniale}
        </p>
      )}
      {foyer.objectifs_patrimoniaux && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          Objectifs : {foyer.objectifs_patrimoniaux}
        </p>
      )}
    </div>
  );
}

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
  onEditFoyer,
  onChangeMemberRole,
  onRemoveMemberFromFoyer,
  onAddFoyerMember,
  onCreateFoyer,
  onViewPrescripteurNetwork,
  onViewFamilleGroup,
  onViewFoyerPage,
}: ContactDetailFoyerTabProps) {
  const allMembers = [contact, ...foyerMembers.filter((m) => m.id !== contact.id)];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <Home className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            Couple / foyer
          </CardTitle>
          {foyer && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onEditFoyer}>
              <Edit className="h-4 w-4" />
              Modifier le foyer
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loadingFoyer ? (
            <div className="text-sm text-muted-foreground">Chargement...</div>
          ) : foyer ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-lg">{foyer.nom}</h3>
                  <Badge className={cn("border", getFoyerTypeBadgeClass(foyer.type_foyer))}>
                    {getFoyerTypeLabel(foyer.type_foyer)}
                  </Badge>
                </div>
                <FoyerFiscalSummary foyer={foyer} />
                {foyerPatrimoine > 0 && (
                  <p className="text-sm text-primary font-medium">
                    Patrimoine commun : {foyerPatrimoine.toLocaleString("fr-FR")} €
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-1.5" onClick={onAddFoyerMember}>
                  <UserPlus className="h-4 w-4" />
                  Ajouter un membre
                </Button>
                {onViewFoyerPage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={onViewFoyerPage}
                  >
                    <Home className="h-4 w-4" />
                    Voir dans Foyers
                  </Button>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">
                  Membres ({allMembers.length})
                </h4>
                <div className="space-y-2">
                  {allMembers.map((member) => (
                    <FoyerMemberRow
                      key={member.id}
                      member={member}
                      isSelf={member.id === contact.id}
                      onOpen={() => {
                        if (member.id !== contact.id) onOpenMemberDetail(member);
                      }}
                      onRoleChange={(role) => onChangeMemberRole(member, role)}
                      onRemove={() => onRemoveMemberFromFoyer(member)}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Cliquez sur un membre pour ouvrir sa fiche. Modifiez le rôle ou retirez un
                  membre sans quitter l&apos;onglet.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-primary/25 bg-primary/5 p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Conjoint ou enfants —{" "}
                <strong className="font-medium text-foreground">
                  même si les noms de famille diffèrent
                </strong>
                . Distinct de la page «&nbsp;Familles&nbsp;» (classement automatique par nom).
              </p>
              <Button className="gap-2 w-full sm:w-auto" onClick={onCreateFoyer}>
                <Home className="h-4 w-4" />
                Constituer un foyer
              </Button>
              <p className="text-xs text-muted-foreground">
                Le conjoint a déjà un foyer ?{" "}
                <button
                  type="button"
                  className="text-primary font-medium underline underline-offset-2 hover:no-underline"
                  onClick={onAddFoyerMember}
                >
                  Rejoindre le foyer d&apos;un contact
                </button>
              </p>
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
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <p className="text-xs text-primary">Voir la fiche prescripteur</p>
                  {onViewPrescripteurNetwork && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewPrescripteurNetwork();
                      }}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Voir le réseau
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Prescripteur introuvable (ID: {contact.prescripteur_id})
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {contact.categorie === "PRESCRIPTEUR" && onViewPrescripteurNetwork && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Réseau de recommandations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Visualisez l&apos;arbre des clients recommandés par ce prescripteur.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onViewPrescripteurNetwork}
            >
              <Share2 className="h-4 w-4" />
              Voir le réseau
            </Button>
          </CardContent>
        </Card>
      )}

      {onViewFamilleGroup && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users2 className="h-5 w-5" />
              Regroupement Familles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Voir ce contact dans la page Familles (homonymes ou famille manuelle
              rattachée).
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onViewFamilleGroup}
            >
              <Users2 className="h-4 w-4" />
              Voir le regroupement
            </Button>
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
                            Dernier suivi :{" "}
                            {formatCalendarDateFr(filleul.date_dernier_contact_filleul)}
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
