import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, UserPlus, Users2 } from "lucide-react";
import { type Contact } from "@/lib/api/tauri-contacts";
import { type Foyer } from "@/lib/api/tauri-foyers";
import {
  countEnfantsFoyer,
  formatFoyerMemberLabel,
  getEnfantsFoyer,
  mergeFoyerMembers,
} from "@/lib/foyers/foyer-utils";
import {
  getFoyerTypeBadgeClass,
  getFoyerTypeLabel,
} from "@/lib/foyers/foyer-display";
import { cn } from "@/lib/utils";

export type ContactFoyerRelationsActions = {
  /** Ouvre le formulaire de modification du foyer (modale). */
  onEditFoyer?: () => void;
  /** Ouvre l'ajout de membre au foyer (modale). */
  onAddFoyerMember?: () => void;
};

interface ContactFoyerRelationsBlockProps {
  contact: Contact;
  foyer: Foyer | null;
  foyerMembers: Contact[];
  loading?: boolean;
  onOpenMember?: (member: Contact) => void;
  actions?: ContactFoyerRelationsActions;
  className?: string;
}

export function ContactFoyerRelationsBlock({
  contact,
  foyer,
  foyerMembers,
  loading = false,
  onOpenMember,
  actions,
  className,
}: ContactFoyerRelationsBlockProps) {
  const hasFoyer = Boolean(contact.foyer_id);
  const allMembers = mergeFoyerMembers(contact, foyerMembers);
  const enfants = getEnfantsFoyer(allMembers);
  const nbEnfants = countEnfantsFoyer(allMembers);
  const isEnfantFoyer = contact.role_foyer === "ENFANT";
  const roleLabel = contact.role_foyer
    ? formatFoyerMemberLabel(contact, contact.role_foyer).split(" · ").pop()
    : null;
  const hasActions = Boolean(actions?.onEditFoyer || actions?.onAddFoyerMember);

  return (
    <div
      className={cn(
        "space-y-3 rounded-md border bg-muted/20 px-3 py-3",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Users2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">Couple / foyer</p>
          <p className="text-xs text-muted-foreground">
            {isEnfantFoyer
              ? "Fratrie du foyer (rôle « Enfant ») — ce contact est lui-même un enfant."
              : "Nombre d'enfants calculé depuis les membres du foyer (rôle « Enfant »)."}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Chargement du foyer…
        </div>
      ) : !hasFoyer ? (
        <p className="text-sm text-muted-foreground">
          Aucun foyer rattaché.
          {hasActions
            ? " Créez ou rejoignez un foyer depuis l'onglet Couple / foyer."
            : " Ouvrez la fiche contact pour gérer le foyer."}
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{foyer?.nom ?? "Foyer"}</span>
              {foyer?.type_foyer && (
                <Badge
                  variant="outline"
                  className={getFoyerTypeBadgeClass(foyer.type_foyer)}
                >
                  {getFoyerTypeLabel(foyer.type_foyer)}
                </Badge>
              )}
            </div>
            {roleLabel && (
              <p className="text-sm text-muted-foreground">
                Rôle de ce contact : {roleLabel}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm">
              <span className="text-muted-foreground">
                {isEnfantFoyer ? "Enfants du foyer" : "Nombre d'enfants"} :{" "}
              </span>
              <span className="font-medium">{nbEnfants}</span>
            </p>
            {enfants.length > 0 ? (
              <ul className="space-y-1">
                {enfants.map((enfant) => (
                  <li key={enfant.id}>
                    {onOpenMember ? (
                      <button
                        type="button"
                        className="text-sm text-primary hover:underline"
                        onClick={() => onOpenMember(enfant)}
                      >
                        {enfant.prenom} {enfant.nom}
                      </button>
                    ) : (
                      <span className="text-sm">
                        {enfant.prenom} {enfant.nom}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Aucun membre avec le rôle « Enfant ».
              </p>
            )}
          </div>
        </>
      )}

      {hasActions && (
        <div className="flex flex-wrap gap-2 pt-1">
          {hasFoyer && actions?.onEditFoyer && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={actions.onEditFoyer}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Modifier le foyer
            </Button>
          )}
          {hasFoyer && actions?.onAddFoyerMember && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={actions.onAddFoyerMember}
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              Ajouter un membre
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
