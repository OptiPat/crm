import { Badge } from "@/components/ui/badge";
import { ChevronRight, Coins, Home, Users } from "lucide-react";
import type { Foyer } from "@/lib/api/tauri-foyers";
import type { Contact } from "@/lib/api/tauri-contacts";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  getFoyerTypeBadgeClass,
  getFoyerTypeLabel,
  formatFoyerCurrencyEur,
} from "@/lib/foyers/foyer-display";
import { formatFoyerMemberLabel } from "@/lib/foyers/foyer-utils";
import { ContactInitialsAvatar } from "@/components/contacts/contacts-ui";
import { cn } from "@/lib/utils";

type FoyerSummaryCardProps = {
  foyer: Foyer;
  membres: Contact[];
  patrimoineAvecMoi?: number;
  selected?: boolean;
  compact?: boolean;
  actionHint?: string;
  onClick: () => void;
};

export function FoyerSummaryCard({
  foyer,
  membres,
  patrimoineAvecMoi,
  selected = false,
  compact = false,
  actionHint = "Voir les membres",
  onClick,
}: FoyerSummaryCardProps) {
  const preview = membres.slice(0, compact ? 2 : 3);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border transition-all duration-200 group",
        "border-border/70 bg-card hover:bg-muted/40 hover:border-primary/30 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        compact ? "p-3" : "p-4",
        selected &&
          "ring-2 ring-primary/45 border-primary/35 bg-primary/[0.04] shadow-sm"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "shrink-0 rounded-xl flex items-center justify-center",
            "bg-gradient-to-br from-amber-500/15 to-amber-600/5 border border-amber-500/20",
            compact ? "h-11 w-11" : "h-12 w-12"
          )}
        >
          <Home className={cn("text-amber-700", compact ? "h-5 w-5" : "h-6 w-6")} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground tracking-tight truncate">
              {foyer.nom}
            </span>
            <Badge
              className={cn(
                "text-xs font-normal border",
                getFoyerTypeBadgeClass(foyer.type_foyer)
              )}
            >
              {getFoyerTypeLabel(foyer.type_foyer)}
            </Badge>
            <Badge variant="secondary" className="text-xs font-normal tabular-nums">
              {membres.length} membre{membres.length !== 1 ? "s" : ""}
            </Badge>
          </div>

          {membres.length > 0 ? (
            <div className="flex items-center gap-1 mt-2">
              {preview.map((m, i) => (
                <div key={m.id} className={cn("relative", i > 0 && "-ml-2")}>
                  <ContactInitialsAvatar
                    prenom={m.prenom}
                    nom={m.nom}
                    className={cn(
                      "h-7 w-7 text-[10px] ring-2 ring-card",
                      compact && "h-6 w-6"
                    )}
                  />
                </div>
              ))}
              {membres.length > preview.length && (
                <span className="text-xs text-muted-foreground ml-1">
                  +{membres.length - preview.length}
                </span>
              )}
              {!compact && (
                <span className="text-xs text-muted-foreground ml-2 truncate hidden sm:inline max-w-[200px]">
                  {preview
                    .map((c) => formatFoyerMemberLabel(c, c.role_foyer))
                    .join(" · ")}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-700/90 mt-1.5">Aucun contact rattaché</p>
          )}

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
            {foyer.nombre_parts_fiscales != null && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {foyer.nombre_parts_fiscales} parts
              </span>
            )}
            {foyer.revenu_fiscal_reference != null && (
              <span className="inline-flex items-center gap-1">
                <Coins className="h-3 w-3" />
                RBG {formatFoyerCurrencyEur(foyer.revenu_fiscal_reference)}
              </span>
            )}
            {foyer.tranche_imposition && (
              <span>TMI {foyer.tranche_imposition}</span>
            )}
            {foyer.ir_net_a_payer != null && foyer.ir_net_a_payer > 0 && (
              <span className="inline-flex items-center gap-1">
                <Coins className="h-3 w-3" />
                IR {formatFoyerCurrencyEur(foyer.ir_net_a_payer)}
              </span>
            )}
          </div>
          {!compact && actionHint && (
            <p className="text-[11px] text-primary/80 mt-1.5 font-medium">{actionHint}</p>
          )}
        </div>

        <div className="shrink-0 text-right flex items-center gap-2">
          {patrimoineAvecMoi != null && patrimoineAvecMoi > 0 && (
            <div>
              <p className="text-sm font-semibold text-primary tabular-nums leading-tight">
                {formatEuroCentimes(patrimoineAvecMoi)}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                avec moi
              </p>
            </div>
          )}
          <ChevronRight
            className={cn(
              "h-5 w-5 text-muted-foreground/40 transition-all",
              "group-hover:text-primary group-hover:translate-x-0.5",
              selected && "text-primary translate-x-0.5"
            )}
          />
        </div>
      </div>
    </button>
  );
}
