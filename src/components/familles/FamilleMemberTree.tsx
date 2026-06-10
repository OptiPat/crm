import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Home, UserMinus, Wallet } from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import {
  formatEuroCentimes,
  getTypeProduitBgColor,
} from "@/lib/investissements/investissement-display";
import { ROLES_FAMILLE, getRoleFamilleIcon } from "@/lib/familles/famille-roles";
import type { FamilleGroup, MemberWithInvestments } from "@/lib/familles/famille-types";
import { ContactInitialsAvatar } from "@/components/contacts/contacts-ui";
import { cn } from "@/lib/utils";

type FamilleMemberTreeProps = {
  famille: FamilleGroup;
  foyers: Foyer[];
  onRoleChange: (contact: Contact, newRole: string) => void;
  onMemberClick: (contact: Contact) => void;
  onExcludeFromFamille?: (contact: Contact) => void;
  selectedContactId?: number;
  showTitle?: boolean;
  isManual?: boolean;
};

function formatDate(timestamp?: number): string {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleDateString("fr-FR");
}

function MemberInvestments({ membre }: { membre: MemberWithInvestments }) {
  if (membre.investissements.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-2 pl-12">
        Aucun investissement
      </p>
    );
  }

  return (
    <ul className="mt-2 space-y-1.5 pl-12 pr-1">
      {membre.investissements.map((inv) => (
        <li
          key={inv.id}
          className={cn(
            "flex items-center justify-between gap-2 text-sm py-2 px-2.5 rounded-lg",
            inv.isCommun
              ? "bg-sky-50/80 border border-sky-200/60"
              : "bg-muted/40 border border-transparent"
          )}
        >
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <Badge
              className="text-[10px] text-white px-1.5 py-0 shrink-0"
              style={{
                backgroundColor: getTypeProduitBgColor(inv.type_produit, inv.origine),
              }}
            >
              {inv.type_produit.replace(/_/g, " ")}
            </Badge>
            {inv.nom_produit &&
              inv.nom_produit.trim() !== "" &&
              inv.nom_produit.toUpperCase().replace(/[- ]/g, "") !==
                inv.type_produit?.toUpperCase().replace(/_/g, "") && (
                <span className="font-medium truncate text-xs">{inv.nom_produit}</span>
              )}
            {inv.isCommun && (
              <span className="text-[10px] text-sky-700 font-medium">Commun</span>
            )}
            {inv.date_souscription && (
              <span className="text-[10px] text-muted-foreground">
                {formatDate(inv.date_souscription)}
              </span>
            )}
          </div>
          <span
            className="text-xs font-semibold tabular-nums shrink-0"
            style={{ color: getTypeProduitBgColor(inv.type_produit, inv.origine) }}
          >
            {formatEuroCentimes(inv.montant_initial || 0)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MemberCard({
  membre,
  foyer,
  isSelected,
  onRoleChange,
  onMemberClick,
  onExcludeFromFamille,
  excludeTitle = "Retirer du regroupement (homonyme)",
}: {
  membre: MemberWithInvestments;
  foyer?: Foyer;
  isSelected: boolean;
  onRoleChange: (contact: Contact, newRole: string) => void;
  onMemberClick: (contact: Contact) => void;
  onExcludeFromFamille?: (contact: Contact) => void;
  excludeTitle?: string;
}) {
  const [investOpen, setInvestOpen] = useState(false);
  const hasInvest = membre.investissements.length > 0;

  return (
    <article
      className={cn(
        "rounded-xl border overflow-hidden transition-colors",
        membre.isSpouse
          ? "border-sky-200/70 bg-sky-50/30 ml-4 sm:ml-6"
          : "border-border/70 bg-card",
        isSelected && "ring-2 ring-primary/40 border-primary/30"
      )}
    >
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          className="flex flex-1 items-start gap-3 min-w-0 text-left rounded-lg hover:bg-muted/40 -m-1 p-1 transition-colors group"
          onClick={() => onMemberClick(membre.contact)}
        >
          <ContactInitialsAvatar
            prenom={membre.contact.prenom}
            nom={membre.contact.nom}
            className={cn(
              "h-11 w-11",
              membre.isSpouse && "ring-2 ring-sky-200/80"
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {membre.contact.prenom} {membre.contact.nom}
              </span>
              {!membre.isSpouse && membre.contact.role_famille && (
                <span className="text-xs text-muted-foreground">
                  {getRoleFamilleIcon(membre.contact.role_famille)}
                </span>
              )}
              {membre.isSpouse && (
                <Badge
                  variant="outline"
                  className="text-xs text-sky-700 border-sky-300/80 bg-sky-50"
                >
                  {membre.spouseOf}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              {foyer ? (
                <>
                  <Home className="h-3 w-3 shrink-0" />
                  <span className="truncate">{foyer.nom}</span>
                </>
              ) : (
                <span className="text-amber-700/90">Sans foyer</span>
              )}
            </p>
            <p className="text-sm font-medium text-primary tabular-nums mt-1.5">
              {formatEuroCentimes(membre.avecMoiTotal)}
              <span className="text-[10px] font-normal text-muted-foreground ml-1">
                avec moi
              </span>
              {membre.patrimoine > membre.avecMoiTotal && (
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  · {formatEuroCentimes(membre.patrimoine)} total
                </span>
              )}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-3 group-hover:text-primary transition-colors" />
        </button>

        <div
          className="flex shrink-0 items-center gap-1 pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {!membre.isSpouse ? (
            <Select
              value={membre.contact.role_famille || ""}
              onValueChange={(value) => onRoleChange(membre.contact, value)}
            >
              <SelectTrigger className="h-8 text-xs w-[8.5rem] bg-background">
                <SelectValue placeholder="Rôle…" />
              </SelectTrigger>
              <SelectContent>
                {ROLES_FAMILLE.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="h-8 text-xs text-sky-700 border-sky-300">
              Conjoint(e)
            </Badge>
          )}
          {!membre.isSpouse && onExcludeFromFamille && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              title={excludeTitle}
              aria-label={`${excludeTitle} — ${membre.contact.prenom} ${membre.contact.nom}`}
              onClick={() => onExcludeFromFamille(membre.contact)}
            >
              <UserMinus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {hasInvest && (
        <div className="border-t border-border/50 bg-muted/20">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            onClick={() => setInvestOpen((o) => !o)}
          >
            {investOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <Wallet className="h-3.5 w-3.5" />
            {membre.investissements.length} investissement
            {membre.investissements.length > 1 ? "s" : ""}
          </button>
          {investOpen && <MemberInvestments membre={membre} />}
        </div>
      )}

      {!hasInvest && (
        <div className="border-t border-dashed border-border/50 px-3 py-2">
          <p className="text-xs text-muted-foreground italic">Aucun investissement</p>
        </div>
      )}
    </article>
  );
}

export function FamilleMemberTree({
  famille,
  foyers,
  onRoleChange,
  onMemberClick,
  onExcludeFromFamille,
  selectedContactId,
  showTitle = true,
  isManual = false,
}: FamilleMemberTreeProps) {
  const getFoyerForMember = (contact: Contact): Foyer | undefined => {
    if (!contact.foyer_id) return undefined;
    return foyers.find((f) => f.id === contact.foyer_id);
  };

  return (
    <div className="space-y-3">
      {showTitle && (
        <p className="text-xs text-muted-foreground">
          {isManual
            ? "Cliquez sur un membre pour ouvrir sa fiche. Icône − pour le retirer de cette famille."
            : "Cliquez sur un membre pour ouvrir sa fiche. Icône − pour retirer un homonyme du regroupement."}
        </p>
      )}
      {famille.membres.map((membre) => (
        <MemberCard
          key={membre.contact.id}
          membre={membre}
          foyer={getFoyerForMember(membre.contact)}
          isSelected={selectedContactId === membre.contact.id}
          onRoleChange={onRoleChange}
          onMemberClick={onMemberClick}
          onExcludeFromFamille={onExcludeFromFamille}
          excludeTitle={
            isManual
              ? "Retirer de la famille"
              : "Retirer du regroupement (homonyme)"
          }
        />
      ))}
    </div>
  );
}
