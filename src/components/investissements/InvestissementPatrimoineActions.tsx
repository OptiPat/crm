import { Button } from "@/components/ui/button";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { isPlacementEncoursEligible } from "@/lib/investissements/investissement-encours";
import { isInvestissementActifEncours } from "@/lib/investissements/investissement-statut";
import { Pencil, Trash2, TrendingUp } from "lucide-react";

export function InvestissementPatrimoineActions({
  inv,
  onEdit,
  onDelete,
  onEncours,
  compact = false,
}: {
  inv: Investissement;
  onEdit: (inv: Investissement) => void;
  onDelete: (inv: Investissement) => void;
  onEncours?: (inv: Investissement) => void;
  /** Icônes seules (fiche contact) vs libellés (page portefeuille). */
  compact?: boolean;
}) {
  const isActif = isInvestissementActifEncours(inv);

  return (
    <div
      className="flex shrink-0 items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {onEncours &&
        isActif &&
        isPlacementEncoursEligible(inv.type_produit) && (
          <Button
            variant={compact ? "ghost" : "outline"}
            size={compact ? "icon" : "sm"}
            className={
              compact
                ? "h-8 w-8 text-amber-700 hover:text-amber-800"
                : "gap-1 text-amber-700 hover:text-amber-800"
            }
            onClick={() => onEncours(inv)}
            aria-label="Encours"
            title="Mettre à jour l'encours"
          >
            <TrendingUp className="h-4 w-4" />
            {!compact && <span className="hidden sm:inline">Encours</span>}
          </Button>
        )}
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon" : "sm"}
        className={compact ? "h-8 w-8" : undefined}
        onClick={() => onEdit(inv)}
        aria-label="Modifier"
        title="Modifier"
      >
        {compact ? (
          <Pencil className="h-4 w-4" />
        ) : (
          "Modifier"
        )}
      </Button>
      <Button
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon" : "sm"}
        className={
          compact
            ? "h-8 w-8 text-destructive hover:text-destructive"
            : "text-destructive hover:text-destructive"
        }
        onClick={() => onDelete(inv)}
        aria-label="Supprimer"
        title="Supprimer définitivement"
      >
        <Trash2 className="h-4 w-4" />
        {!compact && <span className="hidden sm:inline">Supprimer</span>}
      </Button>
    </div>
  );
}
