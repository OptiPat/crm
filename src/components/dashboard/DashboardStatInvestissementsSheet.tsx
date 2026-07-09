import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Building2, CalendarClock, ChevronRight, TrendingUp } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getInvestissementsWithDetails,
  type InvestissementWithDetails,
} from "@/lib/api/tauri-investissements";
import { filterDashboardImmobilierKpiInvestissements } from "@/lib/dashboard/dashboard-immobilier-kpi";
import { listDashboardVersementProgrammeKpiInvestissements } from "@/lib/dashboard/dashboard-versements-kpi";
import { listEncoursPlacementsAvecMoi } from "@/lib/investissements/investissement-encours";
import {
  formatNomProduit,
  getTypeProduitBgColor,
  getTypeProduitTextClass,
} from "@/lib/investissements/investissement-display";
import { cn } from "@/lib/utils";
import { preventStackedSheetOutsideDismiss } from "@/lib/ui/radix-outside-interaction";
import {
  immobilierInvestissementSubtitle,
  investissementOwnerLabel,
  placementsInvestissementSubtitle,
  sortInvestissementsByOwnerThenName,
  versementsInvestissementSubtitle,
} from "./dashboard-investissements-sheet-utils";

export type DashboardInvestissementsSheetVariant = "immo" | "placements" | "versements";

const VARIANT_CONFIG: Record<
  DashboardInvestissementsSheetVariant,
  {
    title: string;
    description: string;
    empty: string;
    icon: LucideIcon;
    loadError: string;
  }
> = {
  immo: {
    title: "Biens immobiliers",
    description:
      "Investissements immobiliers actifs « avec moi » — aligné sur le KPI du tableau de bord.",
    empty: "Aucun bien immobilier",
    icon: Building2,
    loadError: "Erreur chargement immobilier dashboard:",
  },
  placements: {
    title: "Encours placements",
    description:
      "AV, PER, contrats de capitalisation, épargne salariale, FIP/FCPI… actifs « avec moi ».",
    empty: "Aucun placement en encours",
    icon: TrendingUp,
    loadError: "Erreur chargement encours placements dashboard:",
  },
  versements: {
    title: "Versements programmés",
    description: "Contrats avec versements programmés actifs « avec moi » — montant annuel.",
    empty: "Aucun versement programmé",
    icon: CalendarClock,
    loadError: "Erreur chargement versements programmés dashboard:",
  },
};

function loadVariantItems(
  variant: DashboardInvestissementsSheetVariant,
  all: InvestissementWithDetails[]
): InvestissementWithDetails[] {
  switch (variant) {
    case "immo":
      return sortInvestissementsByOwnerThenName(filterDashboardImmobilierKpiInvestissements(all));
    case "placements":
      return listEncoursPlacementsAvecMoi(all);
    case "versements":
      return listDashboardVersementProgrammeKpiInvestissements(all);
  }
}

function itemSubtitle(
  variant: DashboardInvestissementsSheetVariant,
  inv: InvestissementWithDetails
): string {
  switch (variant) {
    case "immo":
      return immobilierInvestissementSubtitle(inv);
    case "placements":
      return placementsInvestissementSubtitle(inv);
    case "versements":
      return versementsInvestissementSubtitle(inv);
  }
}

interface DashboardStatInvestissementsSheetProps {
  variant: DashboardInvestissementsSheetVariant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refreshSignal?: number;
  onOpenContact?: (contactId: number) => void;
  /** Fiche contact ouverte — bloque la fermeture accidentelle du volet liste. */
  stackedContactOpen?: boolean;
  activeContactId?: number | null;
}

export function DashboardStatInvestissementsSheet({
  variant,
  open,
  onOpenChange,
  refreshSignal,
  onOpenContact,
  stackedContactOpen = false,
  activeContactId = null,
}: DashboardStatInvestissementsSheetProps) {
  const [items, setItems] = useState<InvestissementWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const loadSeqRef = useRef(0);

  const config = variant ? VARIANT_CONFIG[variant] : null;
  const RowIcon = config?.icon ?? Building2;

  const loadItems = useCallback(async () => {
    if (!variant) return [];
    const all = await getInvestissementsWithDetails();
    return loadVariantItems(variant, all);
  }, [variant]);

  useEffect(() => {
    if (!open || !variant) return;

    const seq = ++loadSeqRef.current;
    setItems([]);
    setLoading(true);

    void (async () => {
      try {
        const rows = await loadItems();
        if (loadSeqRef.current !== seq) return;
        setItems(rows);
      } catch (error) {
        if (loadSeqRef.current !== seq) return;
        console.error(VARIANT_CONFIG[variant].loadError, error);
        setItems([]);
      } finally {
        if (loadSeqRef.current === seq) {
          setLoading(false);
        }
      }
    })();

    return () => {
      loadSeqRef.current += 1;
    };
  }, [open, variant, loadItems, refreshSignal]);

  if (!config) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        hideOverlay
        className="z-50 flex h-svh max-h-svh min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        onInteractOutside={(event) => {
          if (stackedContactOpen) preventStackedSheetOutsideDismiss(event);
        }}
        onEscapeKeyDown={(event) => {
          if (stackedContactOpen) event.preventDefault();
        }}
      >
        <SheetHeader className="shrink-0 space-y-1 px-6 pb-4 pt-6">
          <SheetTitle className="font-serif pr-8">{config.title}</SheetTitle>
          <SheetDescription>{config.description}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{config.empty}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((inv) => {
                const interactive = Boolean(onOpenContact && inv.contact_id != null);
                const isActive =
                  activeContactId != null && inv.contact_id === activeContactId;
                return (
                  <li key={inv.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        isActive
                          ? "border-primary/50 bg-primary/5"
                          : "border-border/60 bg-background",
                        interactive && "hover:bg-muted/40 cursor-pointer"
                      )}
                      onClick={() => {
                        if (inv.contact_id != null) {
                          onOpenContact?.(inv.contact_id);
                        }
                      }}
                      disabled={!interactive}
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: getTypeProduitBgColor(inv.type_produit, inv.origine),
                        }}
                      >
                        <RowIcon
                          className={cn(
                            "h-4 w-4",
                            getTypeProduitTextClass(inv.type_produit, inv.origine)
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {formatNomProduit(inv.nom_produit) || formatNomProduit(inv.type_produit)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {investissementOwnerLabel(inv)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {itemSubtitle(variant!, inv)}
                        </p>
                      </div>
                      {interactive ? (
                        <ChevronRight
                          className="h-4 w-4 text-muted-foreground shrink-0"
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
