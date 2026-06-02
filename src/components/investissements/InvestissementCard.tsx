import { Badge } from "@/components/ui/badge";
import { InvestissementMetaRow } from "@/components/investissements/InvestissementMetaRow";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  formatEuroCentimes,
  formatNomProduit,
  getTypeProduitBgColor,
  getTypeProduitTextClass,
  INVESTISSEMENT_META_TONE_CLASS,
} from "@/lib/investissements/investissement-display";
import {
  getEffectiveEncoursCentimes,
  isPlacementEncoursEligible,
} from "@/lib/investissements/investissement-encours";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Building2,
  Calendar,
  ChevronRight,
  RefreshCw,
  Repeat,
  Tag,
  TrendingUp,
  User,
} from "lucide-react";

export type InvestissementProprietaireVariant = "self" | "foyer" | "member";

export interface InvestissementCardProps {
  inv: Investissement;
  partenaireNom?: string | null;
  proprietaireLabel?: string;
  proprietaireVariant?: InvestissementProprietaireVariant;
  /** Clic sur la ligne → ouvrir la fiche contact (onglet Patrimoine côté appelant). */
  onOpenContactClick?: () => void;
  actions?: React.ReactNode;
}

function proprietaireBadgeClass(
  variant: InvestissementProprietaireVariant | undefined
): string {
  switch (variant) {
    case "self":
      return "bg-green-50 text-green-700 border-green-200";
    case "foyer":
      return "bg-blue-50 text-blue-700 border-blue-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function nomProduitDistinctDuType(inv: Investissement): boolean {
  if (!inv.nom_produit?.trim()) return false;
  return (
    inv.nom_produit.toUpperCase().replace(/[- ]/g, "") !==
    inv.type_produit?.toUpperCase().replace(/_/g, "")
  );
}

export function InvestissementCard({
  inv,
  partenaireNom,
  proprietaireLabel,
  proprietaireVariant,
  onOpenContactClick,
  actions,
}: InvestissementCardProps) {
  const interactive = Boolean(onOpenContactClick);
  const encoursEligible = isPlacementEncoursEligible(inv.type_produit);
  const hasEncoursReleve =
    inv.encours_actuel != null && inv.encours_actuel > 0;
  const effectiveEncours = getEffectiveEncoursCentimes(inv);

  return (
    <div
      className={cn(
        "p-3 border border-border/80 rounded-lg bg-card transition-colors",
        interactive &&
          "cursor-pointer hover:bg-accent/50 hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      )}
      onClick={onOpenContactClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenContactClick?.();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              className={`${getTypeProduitTextClass(inv.type_produit, inv.origine)} text-xs font-medium px-2 py-0.5 border-transparent`}
              style={{
                backgroundColor: getTypeProduitBgColor(
                  inv.type_produit,
                  inv.origine
                ),
              }}
            >
              {formatNomProduit(inv.type_produit || "AUTRE")}
            </Badge>
            {inv.origine === "EXISTANT_CLIENT" && (
              <span className="text-xs text-gray-500 italic">à côté</span>
            )}
            {proprietaireLabel && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs rounded-md border px-2 py-0.5 font-medium",
                  proprietaireBadgeClass(proprietaireVariant),
                  interactive && "group-hover:underline"
                )}
              >
                <User className="h-3 w-3 shrink-0" aria-hidden />
                {proprietaireLabel}
              </span>
            )}
          </div>
          {nomProduitDistinctDuType(inv) && (
            <p className="font-medium text-foreground">
              {formatNomProduit(inv.nom_produit)}
            </p>
          )}
          {partenaireNom && (
            <InvestissementMetaRow icon={Building2}>
              {partenaireNom}
            </InvestissementMetaRow>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
            {encoursEligible && hasEncoursReleve ? (
              <>
                <InvestissementMetaRow icon={TrendingUp} tone="growth">
                  Encours : {formatEuroCentimes(effectiveEncours)}
                  {inv.encours_date && (
                    <> · {formatCalendarDateFr(inv.encours_date)}</>
                  )}
                </InvestissementMetaRow>
                {(inv.montant_initial ?? 0) > 0 && (
                  <InvestissementMetaRow tone="amount">
                    Investi : {formatEuroCentimes(inv.montant_initial)}
                  </InvestissementMetaRow>
                )}
              </>
            ) : (
              <InvestissementMetaRow tone="amount">
                {formatEuroCentimes(inv.montant_initial)}
              </InvestissementMetaRow>
            )}
            {inv.date_souscription && (
              <InvestissementMetaRow icon={Calendar}>
                {formatCalendarDateFr(inv.date_souscription)}
              </InvestissementMetaRow>
            )}
            {inv.montant_versement_programme &&
              inv.montant_versement_programme > 0 && (
                <InvestissementMetaRow icon={Repeat} tone="vp">
                  VP : {formatEuroCentimes(inv.montant_versement_programme)}
                  {inv.frequence_versement &&
                    ` (${inv.frequence_versement})`}
                </InvestissementMetaRow>
              )}
            {inv.notes?.match(/Mode de détention:\s*([^\|]+)/i) && (
              <InvestissementMetaRow icon={Tag} tone="tag">
                {inv.notes
                  .match(/Mode de détention:\s*([^\|]+)/i)?.[1]
                  .trim()}
              </InvestissementMetaRow>
            )}
            {inv.notes?.match(/Durée:\s*([^\|]+)/i) &&
              (() => {
                const dureeStr = inv.notes
                  .match(/Durée:\s*([^\|]+)/i)?.[1]
                  .trim();

                if (dureeStr?.toLowerCase().includes("viager")) {
                  return (
                    <InvestissementMetaRow icon={RefreshCw} tone="term">
                      Viager
                    </InvestissementMetaRow>
                  );
                }
                const dureeMatch = dureeStr?.match(/(\d+)\s*ans/i);
                if (dureeMatch?.[1] && inv.date_fin_demembrement) {
                  const dateFin = formatCalendarDateFr(inv.date_fin_demembrement);
                  return (
                    <span
                      className={`text-sm ${INVESTISSEMENT_META_TONE_CLASS.term}`}
                    >
                      <RefreshCw
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden
                      />
                      <span>{dureeMatch[1]}&nbsp;ans</span>
                      <ArrowRight
                        className="h-3 w-3 shrink-0 opacity-60"
                        aria-hidden
                      />
                      <Calendar
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden
                      />
                      <span>{dateFin}</span>
                    </span>
                  );
                }
                return null;
              })()}
            {inv.reinvestissement_dividendes && (
              <InvestissementMetaRow icon={TrendingUp} tone="growth">
                Réinv.{" "}
                {(() => {
                  const match = inv.notes?.match(/(\d+)%/);
                  return match?.[1] ? `${match[1]}%` : "100%";
                })()}
              </InvestissementMetaRow>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {interactive && (
            <ChevronRight
              className="h-4 w-4 text-muted-foreground/50 hidden sm:block"
              aria-hidden
            />
          )}
          {actions ? (
            <div
              className="flex gap-2"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
