import { Badge } from "@/components/ui/badge";
import { ChevronRight, Share2, Users } from "lucide-react";
import type { PrescripteurStats } from "@/lib/prescripteurs/prescripteur-tree";
import {
  formatFilleulCategorie,
  getContactDisplayName,
  type FoyerInfo,
} from "@/lib/prescripteurs/prescripteur-tree";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { cn } from "@/lib/utils";

type PrescripteurSummaryCardProps = {
  stats: PrescripteurStats;
  foyersInfo: Record<number, FoyerInfo>;
  selected?: boolean;
  compact?: boolean;
  actionHint?: string;
  onClick: () => void;
};

export function PrescripteurSummaryCard({
  stats,
  foyersInfo,
  selected = false,
  compact = false,
  actionHint = "Voir le réseau",
  onClick,
}: PrescripteurSummaryCardProps) {
  const { contact } = stats;
  const displayName = getContactDisplayName(contact, foyersInfo);

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
            "bg-gradient-to-br from-violet-500/15 to-violet-600/5 border border-violet-500/20",
            compact ? "h-11 w-11" : "h-12 w-12"
          )}
        >
          <Share2 className={cn("text-violet-700", compact ? "h-5 w-5" : "h-6 w-6")} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground tracking-tight truncate">
              {displayName}
            </span>
            {contact.categorie === "PRESCRIPTEUR" && (
              <Badge className="bg-violet-100 text-violet-800 text-xs font-normal">
                Prescripteur
              </Badge>
            )}
            {contact.filleul_categorie && (
              <Badge className="bg-amber-100 text-amber-800 text-xs font-normal">
                {formatFilleulCategorie(contact.filleul_categorie)}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {stats.nombreClientsDirects} direct
              {stats.nombreClientsTotal > stats.nombreClientsDirects &&
                ` · ${stats.nombreClientsTotal} total`}
            </span>
          </p>
          {!compact && actionHint && (
            <p className="text-[11px] text-primary/80 mt-1.5 font-medium">{actionHint}</p>
          )}
        </div>

        <div className="shrink-0 text-right flex items-center gap-2">
          <div className="hidden sm:block">
            <p className="text-xs text-muted-foreground">Apporté</p>
            <p className="text-sm font-semibold text-emerald-700 tabular-nums">
              {formatEuroCentimes(stats.patrimoineApporteTotal)}
            </p>
            <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
              perso {formatEuroCentimes(stats.patrimoinePersonnel)}
            </p>
          </div>
          <div className="sm:hidden">
            <p className="text-sm font-semibold text-emerald-700 tabular-nums">
              {formatEuroCentimes(stats.patrimoineApporteTotal)}
            </p>
          </div>
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
