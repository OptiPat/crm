import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Tag } from "lucide-react";
import { 
  getAllEtiquettes, 
  getContrastColor,
  type Etiquette 
} from "@/lib/api/tauri-etiquettes";
import { cn } from "@/lib/utils";
import { STACKED_NESTED_POPOVER_Z } from "@/lib/ui/stacked-sheet-layers";

interface EtiquetteSelectorProps {
  /** IDs des étiquettes actuellement attribuées au contact */
  selectedIds: number[];
  /** Callback quand on ajoute une étiquette */
  onAdd: (etiquetteId: number) => void;
  /** Callback quand on retire une étiquette */
  onRemove: (etiquetteId: number) => void;
  /** Désactiver le sélecteur */
  disabled?: boolean;
  /** Classe CSS additionnelle */
  className?: string;
  /** Ouverture contrôlée (optionnel : permet d'ouvrir le popover depuis l'extérieur). */
  open?: boolean;
  /** Notifie le parent du changement d'ouverture (mode contrôlé). */
  onOpenChange?: (open: boolean) => void;
  /** Volet empilé (drill-down dashboard). */
  nestedSheet?: boolean;
}

/**
 * Composant EtiquetteSelector - Popover pour ajouter/retirer des étiquettes
 * 
 * Usage:
 * ```tsx
 * <EtiquetteSelector
 *   selectedIds={[1, 3]}
 *   onAdd={(id) => handleAddEtiquette(id)}
 *   onRemove={(id) => handleRemoveEtiquette(id)}
 * />
 * ```
 */
export function EtiquetteSelector({
  selectedIds,
  onAdd,
  onRemove,
  disabled = false,
  className,
  open: controlledOpen,
  onOpenChange,
  nestedSheet = false,
}: EtiquetteSelectorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Charger les étiquettes quand le popover s'ouvre
  useEffect(() => {
    if (open) {
      loadEtiquettes();
    }
  }, [open]);

  const loadEtiquettes = async () => {
    setLoading(true);
    try {
      const data = await getAllEtiquettes();
      setEtiquettes(data.filter((e) => e.actif !== false));
    } catch (error) {
      console.error("Error loading etiquettes:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEtiquettes = etiquettes.filter((etiquette) =>
    etiquette.nom.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggle = (etiquette: Etiquette) => {
    if (selectedIds.includes(etiquette.id)) {
      onRemove(etiquette.id);
    } else {
      onAdd(etiquette.id);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("gap-1.5", className)}
        >
          <Plus className="h-3.5 w-3.5" />
          <Tag className="h-3.5 w-3.5" />
          <span className="sr-only md:not-sr-only">Étiquette</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-72 p-0", nestedSheet && STACKED_NESTED_POPOVER_Z)} align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto p-2">
          {loading ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Chargement...
            </div>
          ) : filteredEtiquettes.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              {searchQuery ? "Aucune étiquette trouvée" : "Aucune étiquette disponible"}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredEtiquettes.map((etiquette) => {
                const isSelected = selectedIds.includes(etiquette.id);
                return (
                  <div
                    key={etiquette.id}
                    className={cn(
                      "flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                      isSelected ? "bg-accent" : "hover:bg-muted"
                    )}
                    onClick={() => handleToggle(etiquette)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggle(etiquette)}
                      className="pointer-events-none"
                    />
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: etiquette.couleur,
                        color: getContrastColor(etiquette.couleur)
                      }}
                    >
                      <span>{etiquette.nom}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedIds.length > 0 && (
          <div className="p-2 border-t text-xs text-muted-foreground text-center">
            {selectedIds.length} étiquette{selectedIds.length > 1 ? "s" : ""} sélectionnée{selectedIds.length > 1 ? "s" : ""}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
