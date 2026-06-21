import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactInitialsAvatar } from "@/components/contacts/contacts-ui";
import { formatFoyerMemberLabel } from "@/lib/foyers/foyer-utils";
import type { MemberWithInvestments } from "@/lib/familles/famille-types";
import {
  formatEuroCentimes,
  getTypeProduitBgColor,
} from "@/lib/investissements/investissement-display";
import { ChevronDown, ChevronRight, UserRound, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type FoyerMemberListProps = {
  membres: MemberWithInvestments[];
  highlightContactId?: number;
  onMemberClick: (contact: MemberWithInvestments["contact"]) => void;
  showTitle?: boolean;
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
  isHighlighted,
  onMemberClick,
}: {
  membre: MemberWithInvestments;
  isHighlighted: boolean;
  onMemberClick: (contact: MemberWithInvestments["contact"]) => void;
}) {
  const [investOpen, setInvestOpen] = useState(false);
  const hasInvest = membre.investissements.length > 0;
  const memberId = membre.contact.id;
  const contact = membre.contact;

  return (
    <article
      id={memberId != null ? `foyer-member-${memberId}` : undefined}
      className={cn(
        "rounded-xl border overflow-hidden transition-colors border-border/70 bg-card",
        isHighlighted && "ring-2 ring-primary/40 border-primary/30"
      )}
    >
      <div className="flex items-start gap-2 p-3">
        <div className="flex flex-1 items-start gap-3 min-w-0">
          <ContactInitialsAvatar
            prenom={contact.prenom}
            nom={contact.nom}
            className="h-11 w-11 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm">
              {formatFoyerMemberLabel(contact, contact.role_foyer)}
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {contact.email || contact.telephone || "—"}
            </div>
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
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs gap-1 shrink-0"
          onClick={() => onMemberClick(contact)}
          title={`Ouvrir la fiche de ${contact.prenom} ${contact.nom}`}
        >
          <UserRound className="h-3 w-3" />
          <span className="hidden sm:inline">Fiche</span>
        </Button>
      </div>

      {hasInvest ? (
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
      ) : (
        <div className="border-t border-dashed border-border/50 px-3 py-2">
          <p className="text-xs text-muted-foreground italic">Aucun investissement</p>
        </div>
      )}
    </article>
  );
}

export function FoyerMemberList({
  membres,
  highlightContactId,
  onMemberClick,
  showTitle = true,
}: FoyerMemberListProps) {
  useEffect(() => {
    if (highlightContactId == null) return;
    document
      .getElementById(`foyer-member-${highlightContactId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightContactId, membres.length]);

  if (membres.length === 0) {
    return (
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
        Aucun contact rattaché. Associez des membres depuis la fiche contact (onglet Couple /
        foyer) ou via Contacts → Afficher par foyer.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {showTitle && (
        <p className="text-xs text-muted-foreground">
          Dépliez les investissements sous chaque membre. Bouton{" "}
          <strong className="font-medium text-foreground/80">Fiche</strong> pour ouvrir le
          contact.
        </p>
      )}
      {membres.map((membre) => (
        <MemberCard
          key={membre.contact.id}
          membre={membre}
          isHighlighted={highlightContactId === membre.contact.id}
          onMemberClick={onMemberClick}
        />
      ))}
    </div>
  );
}
