import { Badge } from "@/components/ui/badge";
import { ChevronRight, Mail, Phone, Wallet } from "lucide-react";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import { getPartenaireTypeInfo } from "@/lib/partenaires/partenaire-display";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { cn } from "@/lib/utils";

export type PartenaireListMeta = {
  investissementCount: number;
  patrimoineAvecMoi: number;
};

type PartenaireSummaryCardProps = {
  partenaire: Partenaire;
  meta?: PartenaireListMeta;
  selected?: boolean;
  compact?: boolean;
  onClick: () => void;
};

export function PartenaireSummaryCard({
  partenaire,
  meta,
  selected = false,
  compact = false,
  onClick,
}: PartenaireSummaryCardProps) {
  const typeInfo = getPartenaireTypeInfo(partenaire.type_partenaire);
  const TypeIcon = typeInfo.icon;
  const contactLine = [partenaire.prenom_contact, partenaire.nom_contact]
    .filter(Boolean)
    .join(" ");

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
            "shrink-0 rounded-xl flex items-center justify-center border bg-gradient-to-br",
            typeInfo.accentClass,
            compact ? "h-11 w-11" : "h-12 w-12"
          )}
        >
          <TypeIcon className={cn("text-foreground/80", compact ? "h-5 w-5" : "h-6 w-6")} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground tracking-tight truncate">
              {partenaire.raison_sociale}
            </span>
            <Badge className={cn("text-xs font-normal border", typeInfo.badgeClass)}>
              {typeInfo.label}
            </Badge>
          </div>

          {(contactLine || partenaire.email || partenaire.telephone) && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
              {contactLine && <span className="truncate">{contactLine}</span>}
              {partenaire.email && (
                <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
                  <Mail className="h-3 w-3 shrink-0" />
                  {partenaire.email}
                </span>
              )}
              {partenaire.telephone && !compact && (
                <span className="inline-flex items-center gap-1 shrink-0">
                  <Phone className="h-3 w-3" />
                  {partenaire.telephone}
                </span>
              )}
            </div>
          )}

          {meta && meta.investissementCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1.5 inline-flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              {meta.investissementCount} produit
              {meta.investissementCount > 1 ? "s" : ""} lié
              {meta.investissementCount > 1 ? "s" : ""}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right flex items-center gap-2">
          {meta && meta.patrimoineAvecMoi > 0 && (
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-primary tabular-nums leading-tight">
                {formatEuroCentimes(meta.patrimoineAvecMoi)}
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
