import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, PieChart } from "lucide-react";
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
import type { DashboardProductFamilyId } from "@/lib/dashboard/dashboard-product-families";
import {
  dashboardProductFamilySheetDescription,
  dashboardProductFamilySheetTitle,
  filterDashboardProductFamilyEncoursAvecMoi,
} from "@/lib/dashboard/dashboard-product-family-kpi";
import {
  formatNomProduit,
  getTypeProduitBgColor,
  getTypeProduitTextClass,
} from "@/lib/investissements/investissement-display";
import { cn } from "@/lib/utils";
import { preventStackedSheetOutsideDismiss } from "@/lib/ui/radix-outside-interaction";
import {
  investissementOwnerLabel,
  placementsInvestissementSubtitle,
  sortInvestissementsByOwnerThenName,
} from "./dashboard-investissements-sheet-utils";

interface DashboardStatProductFamilySheetProps {
  familyId: DashboardProductFamilyId | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refreshSignal?: number;
  onOpenContact?: (contactId: number) => void;
  stackedContactOpen?: boolean;
  activeContactId?: number | null;
}

export function DashboardStatProductFamilySheet({
  familyId,
  open,
  onOpenChange,
  refreshSignal,
  onOpenContact,
  stackedContactOpen = false,
  activeContactId = null,
}: DashboardStatProductFamilySheetProps) {
  const [items, setItems] = useState<InvestissementWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const loadSeqRef = useRef(0);

  const loadItems = useCallback(async () => {
    if (!familyId) return [];
    const all = await getInvestissementsWithDetails();
    return sortInvestissementsByOwnerThenName(
      filterDashboardProductFamilyEncoursAvecMoi(all, familyId)
    );
  }, [familyId]);

  useEffect(() => {
    if (!open || !familyId) return;

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
        console.error("Erreur chargement famille produit dashboard:", error);
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
  }, [open, familyId, loadItems, refreshSignal]);

  if (!familyId) return null;

  const title = dashboardProductFamilySheetTitle(familyId);
  const description = dashboardProductFamilySheetDescription(familyId);

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
          <SheetTitle className="font-serif pr-8">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Aucun encours dans cette famille
            </p>
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
                        <PieChart
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
                          {placementsInvestissementSubtitle(inv)}
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
