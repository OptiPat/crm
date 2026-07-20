import { useEffect, useRef, useState } from "react";
import { Building2, ChevronRight, TrendingUp } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import {
  formatEuroCentimes,
  formatNomProduit,
  getTypeProduitBgColor,
  getTypeProduitTextClass,
  IMMOBILIER_TYPES,
} from "@/lib/investissements/investissement-display";
import { cn } from "@/lib/utils";
import { preventStackedSheetOutsideDismiss } from "@/lib/ui/radix-outside-interaction";
import { investissementOwnerLabel } from "@/components/dashboard/dashboard-investissements-sheet-utils";

function investissementRowIcon(typeProduit: string) {
  return IMMOBILIER_TYPES.includes(typeProduit as (typeof IMMOBILIER_TYPES)[number])
    ? Building2
    : TrendingUp;
}

interface SourceLeadInvestissementsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  loadItems: () => Promise<InvestissementWithDetails[]>;
  refreshSignal?: number;
  onOpenContact?: (contactId: number) => void;
  resolveContactId: (inv: InvestissementWithDetails) => number | null;
  stackedContactOpen?: boolean;
  activeContactId?: number | null;
}

export function SourceLeadInvestissementsSheet({
  open,
  onOpenChange,
  title,
  description,
  loadItems,
  refreshSignal,
  onOpenContact,
  resolveContactId,
  stackedContactOpen = false,
  activeContactId = null,
}: SourceLeadInvestissementsSheetProps) {
  const [items, setItems] = useState<InvestissementWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    if (!open) return;

    const seq = ++loadSeqRef.current;
    setLoading(true);

    void (async () => {
      try {
        const rows = await loadItems();
        if (loadSeqRef.current !== seq) return;
        setItems(rows);
      } catch (error) {
        if (loadSeqRef.current !== seq) return;
        console.error("Erreur chargement investissements statistiques:", error);
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
  }, [open, loadItems, refreshSignal]);

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
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucun investissement</p>
          ) : (
            <ul className="space-y-2">
              {items.map((inv) => {
                const contactId = resolveContactId(inv);
                const interactive = Boolean(onOpenContact && contactId != null);
                const isActive = activeContactId != null && contactId === activeContactId;
                const RowIcon = investissementRowIcon(inv.type_produit);
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
                        if (contactId != null) onOpenContact?.(contactId);
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
                          aria-hidden
                        />
                      </div>
                      <div className="min-h-0 flex-1">
                        <p className="font-medium truncate">{formatNomProduit(inv.nom_produit)}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {investissementOwnerLabel(inv)} ·{" "}
                          {formatEuroCentimes(inv.montant_initial ?? 0)}
                        </p>
                      </div>
                      {interactive ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
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
