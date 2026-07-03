import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";
import {
  formatEuroCentimes,
  getTypeProduitBgColor,
} from "@/lib/investissements/investissement-display";
import {
  countOrphanPartenaireProducts,
  getPartenaireProductOwner,
} from "@/lib/partenaires/partenaires-product-owner";
import { AlertTriangle, Home, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";

type PartenaireProductListProps = {
  investissements: Investissement[];
  contactLabelById: Record<number, string>;
  foyerLabelById: Record<number, string>;
  highlightInvestissementId?: number;
  onOpenContact: DashboardDrillDownOpenContact;
  onOpenFoyer?: (foyerId: number) => void;
  showTitle?: boolean;
};

function formatDate(timestamp?: number): string {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleDateString("fr-FR");
}

export function PartenaireProductList({
  investissements,
  contactLabelById,
  foyerLabelById,
  highlightInvestissementId,
  onOpenContact,
  onOpenFoyer,
  showTitle = false,
}: PartenaireProductListProps) {
  const highlightRef = useRef<HTMLLIElement | null>(null);
  const orphanCount = countOrphanPartenaireProducts(investissements);
  const listContactIds = investissements
    .map((inv) => inv.contact_id)
    .filter((id): id is number => id != null && id > 0);

  useEffect(() => {
    if (highlightInvestissementId == null) return;
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlightInvestissementId, investissements.length]);

  if (investissements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-2">
        Aucun produit client rattaché à ce partenaire.
      </p>
    );
  }

  return (
    <div>
      {showTitle && (
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          {investissements.length} produit{investissements.length !== 1 ? "s" : ""} lié
          {investissements.length !== 1 ? "s" : ""}
          {orphanCount > 0 && (
            <span className="normal-case font-normal text-amber-700/90">
              {" "}
              · {orphanCount} sans détenteur
            </span>
          )}
        </p>
      )}
      <ul className="space-y-2">
        {investissements.map((inv) => {
          const highlighted = highlightInvestissementId === inv.id;
          const owner = getPartenaireProductOwner(inv, contactLabelById, foyerLabelById);
          const OwnerIcon =
            owner.kind === "foyer" ? Home : owner.kind === "orphan" ? AlertTriangle : UserRound;

          return (
            <li
              key={inv.id}
              ref={highlighted ? highlightRef : undefined}
              className={cn(
                "rounded-lg border px-3 py-2.5 transition-colors",
                highlighted
                  ? "border-primary/40 bg-primary/[0.06] ring-1 ring-primary/25"
                  : owner.kind === "orphan"
                    ? "border-amber-200/80 bg-amber-50/40 border-dashed"
                    : "border-border/70 bg-card"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className="text-[10px] text-white px-1.5 py-0 shrink-0"
                      style={{
                        backgroundColor: getTypeProduitBgColor(
                          inv.type_produit,
                          inv.origine
                        ),
                      }}
                    >
                      {inv.type_produit.replace(/_/g, " ")}
                    </Badge>
                    {inv.nom_produit && (
                      <span className="font-medium text-sm truncate">{inv.nom_produit}</span>
                    )}
                    {inv.origine === "MON_CONSEIL" && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        Avec moi
                      </Badge>
                    )}
                    {owner.kind === "orphan" && (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-normal border-amber-300 text-amber-800 bg-amber-50"
                      >
                        Orphelin
                      </Badge>
                    )}
                  </div>
                  <p
                    className={cn(
                      "text-xs inline-flex items-center gap-1",
                      owner.kind === "orphan"
                        ? "text-amber-800/90 italic"
                        : "text-muted-foreground"
                    )}
                  >
                    <OwnerIcon className="h-3 w-3 shrink-0" />
                    {owner.kind === "foyer" ? `Foyer · ${owner.label}` : owner.label}
                    {inv.date_souscription ? (
                      <span> · {formatDate(inv.date_souscription)}</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-sm font-semibold tabular-nums"
                    style={{
                      color: getTypeProduitBgColor(inv.type_produit, inv.origine),
                    }}
                  >
                    {formatEuroCentimes(getEffectiveEncoursCentimes(inv))}
                  </span>
                  {owner.kind === "contact" && owner.contactId != null && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onOpenContact(owner.contactId!, listContactIds)}
                    >
                      Fiche
                    </Button>
                  )}
                  {owner.kind === "foyer" && owner.foyerId != null && onOpenFoyer && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onOpenFoyer(owner.foyerId!)}
                    >
                      Foyer
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

