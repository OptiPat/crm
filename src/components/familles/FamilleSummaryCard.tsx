import { Badge } from "@/components/ui/badge";
import { ChevronRight, Home } from "lucide-react";
import type { FamilleGroup } from "@/lib/familles/famille-types";
import { getRoleFamilleIcon } from "@/lib/familles/famille-roles";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { ContactInitialsAvatar } from "@/components/contacts/contacts-ui";
import { cn } from "@/lib/utils";

type FamilleSummaryCardProps = {
  famille: FamilleGroup;
  memberCount: number;
  selected?: boolean;
  compact?: boolean;
  actionHint?: string;
  onClick: () => void;
};

export function FamilleSummaryCard({
  famille,
  memberCount,
  selected = false,
  compact = false,
  actionHint = "Voir les membres",
  onClick,
}: FamilleSummaryCardProps) {
  const coreMembers = famille.membres.filter((m) => !m.isSpouse && !m.isFoyerChild);
  const previewMembers = coreMembers.slice(0, compact ? 3 : 4);

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
            "shrink-0 rounded-xl flex items-center justify-center font-serif font-bold text-primary",
            "bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15",
            compact ? "h-11 w-11 text-lg" : "h-12 w-12 text-xl"
          )}
          aria-hidden
        >
          {famille.nom.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground tracking-tight">
              {famille.nom}
            </span>
            <Badge variant="secondary" className="text-xs font-normal tabular-nums">
              {memberCount} membre{memberCount > 1 ? "s" : ""}
            </Badge>
            {famille.isManual && (
              <Badge variant="outline" className="text-xs font-normal">
                Manuelle
              </Badge>
            )}
            {famille.foyers.length > 0 && (
              <Badge variant="outline" className="text-xs gap-1 font-normal">
                <Home className="h-3 w-3" />
                {famille.foyers.length}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1 mt-2">
            {previewMembers.map((m, i) => (
              <div
                key={m.contact.id}
                className={cn("relative", i > 0 && "-ml-2")}
                title={`${m.contact.prenom} ${m.contact.nom}`}
              >
                <ContactInitialsAvatar
                  prenom={m.contact.prenom}
                  nom={m.contact.nom}
                  className={cn(
                    "h-7 w-7 text-[10px] ring-2 ring-card",
                    compact && "h-6 w-6"
                  )}
                />
              </div>
            ))}
            {coreMembers.length > previewMembers.length && (
              <span className="text-xs text-muted-foreground ml-1">
                +{coreMembers.length - previewMembers.length}
              </span>
            )}
            {!compact && (
              <span className="text-xs text-muted-foreground ml-2 truncate hidden sm:inline">
                {previewMembers
                  .map(
                    (m) =>
                      `${getRoleFamilleIcon(m.contact.role_famille)} ${m.contact.prenom}`
                  )
                  .join(" · ")}
              </span>
            )}
          </div>
          {!compact && actionHint && (
            <p className="text-[11px] text-primary/80 mt-1.5 font-medium">{actionHint}</p>
          )}
        </div>

        <div className="shrink-0 text-right flex items-center gap-2">
          <div>
            <p className="text-sm font-semibold text-primary tabular-nums leading-tight">
              {formatEuroCentimes(famille.patrimoineAvecMoi)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
              avec moi
            </p>
            {famille.patrimoineTotal > famille.patrimoineAvecMoi && (
              <p className="text-[10px] text-muted-foreground/80 tabular-nums mt-0.5">
                {formatEuroCentimes(famille.patrimoineTotal)} total
              </p>
            )}
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
