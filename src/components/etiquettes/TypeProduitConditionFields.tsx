import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryTogglePills } from "@/components/etiquettes/etiquette-form-ui";
import { INVESTISSEMENT_TYPE_GROUPS } from "@/lib/etiquettes/etiquette-investissement-types";
import {
  buildProductPickerRows,
  nomInList,
  toggleNomInList,
} from "@/lib/investissements/product-target-filter";
import { useNomProduitInvestissements } from "@/lib/investissements/use-nom-produit-investissements";
import { cn } from "@/lib/utils";
import { Package, Search, X } from "lucide-react";

export type ProduitsMatchMode = "all" | "any";

type Props = {
  types: string[];
  nomsProduit: string[];
  onTypesChange: (next: string[]) => void;
  onNomsProduitChange: (next: string[]) => void;
  typesFieldId?: string;
  typesFieldHighlight?: boolean;
  /** Surligne tout le bloc (validation type ou nom manquant). */
  highlightInvalid?: boolean;
  compact?: boolean;
  /** Carte « Patrimoine ciblé » (campagnes éphémères). */
  variant?: "default" | "card";
  /** Patrimoine facultatif (campagne éphémère par catégories seules). */
  productFilterOptional?: boolean;
  showEmptyWarning?: boolean;
  produitsMatchMode?: ProduitsMatchMode;
  onProduitsMatchModeChange?: (mode: ProduitsMatchMode) => void;
};

export function TypeProduitConditionFields({
  types,
  nomsProduit,
  onTypesChange,
  onNomsProduitChange,
  typesFieldId,
  typesFieldHighlight,
  highlightInvalid,
  compact = false,
  variant = "default",
  productFilterOptional = false,
  showEmptyWarning = false,
  produitsMatchMode = "all",
  onProduitsMatchModeChange,
}: Props) {
  const { investissements, loading } = useNomProduitInvestissements();
  const [nomSearch, setNomSearch] = useState("");

  const portfolioRows = useMemo(
    () => buildProductPickerRows(investissements, types),
    [investissements, types]
  );

  const filteredRows = useMemo(() => {
    const q = nomSearch.trim().toLowerCase();
    if (!q) return portfolioRows;
    return portfolioRows.filter((row) => row.nom_produit.toLowerCase().includes(q));
  }, [portfolioRows, nomSearch]);

  const hasSelection = types.length > 0 || nomsProduit.length > 0;
  const multipleNames = nomsProduit.length >= 2;
  const showMatchMode = multipleNames && onProduitsMatchModeChange != null;

  const toggleType = (value: string) => {
    if (types.includes(value)) {
      onTypesChange(types.filter((t) => t !== value));
    } else {
      onTypesChange([...types, value]);
    }
  };

  const content = (
    <>
      {variant === "card" && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Package className="h-4 w-4 text-primary shrink-0" />
            Patrimoine ciblé
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {productFilterOptional ? (
              <>
                Facultatif — sans sélection, tous les contacts des catégories cochées sont ciblés.
                Cochez un <strong className="font-medium text-foreground">type</strong> ou un{" "}
                <strong className="font-medium text-foreground">nom de produit</strong> pour
                restreindre aux détenteurs correspondants.
              </>
            ) : (
              <>
                Choisissez au moins un <strong className="font-medium text-foreground">type</strong>{" "}
                ou un <strong className="font-medium text-foreground">nom de produit</strong>. Un
                contact est retenu s&apos;il détient un investissement qui correspond aux deux
                filtres actifs.
              </>
            )}
          </p>
        </div>
      )}

      <div className={cn("space-y-3", compact && "space-y-2")}>
        <div className="space-y-1">
          <Label className="text-sm">Types de produit</Label>
          <p className="text-xs text-muted-foreground">
            Facultatif — aucun type coché = tous les types du portefeuille.
          </p>
        </div>
        <div
          id={typesFieldId}
          className={cn(
            "space-y-3",
            compact && "space-y-2",
            typesFieldHighlight &&
              "rounded-lg ring-2 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2"
          )}
        >
          {INVESTISSEMENT_TYPE_GROUPS.map((group) => (
            <div key={group.label} className={cn("space-y-2", compact && "space-y-1.5")}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <CategoryTogglePills
                categories={group.types}
                selected={types}
                onToggle={toggleType}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={cn("space-y-3 border-t pt-4", compact && "space-y-2 pt-3")}>
        <div className="space-y-1">
          <Label className="text-sm">Noms de produit</Label>
          <p className="text-xs text-muted-foreground">
            Facultatif — cochez un ou plusieurs noms déjà présents sur des fiches investissement
            {types.length > 0 ? " (liste filtrée par les types cochés)" : ""}.
            {variant === "default" && (
              <>
                {" "}
                Au moins un type ou un nom requis ; les deux filtres se cumulent (ET) sur le même
                investissement.
              </>
            )}
          </p>
        </div>

        {nomsProduit.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {nomsProduit.map((nom) => (
              <Badge key={nom} variant="secondary" className="gap-1 pr-1 text-xs">
                {nom}
                <button
                  type="button"
                  className="rounded-sm hover:bg-muted"
                  onClick={() => onNomsProduitChange(nomsProduit.filter((n) => n !== nom))}
                  aria-label={`Retirer ${nom}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {nomsProduit.length === 1 && (
          <p className="text-xs text-muted-foreground rounded-md bg-muted/40 px-3 py-2">
            Le contact doit détenir « {nomsProduit[0]} »
            {types.length > 0 ? " parmi les types sélectionnés" : ""}.
          </p>
        )}

        {showMatchMode && (
          <div className="space-y-2 rounded-md bg-muted/30 px-3 py-2.5">
            <Label className="text-xs">Plusieurs noms sélectionnés — le contact doit avoir</Label>
            <Select
              value={produitsMatchMode}
              onValueChange={(v) => onProduitsMatchModeChange(v as ProduitsMatchMode)}
            >
              <SelectTrigger className="h-9 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous ces produits</SelectItem>
                <SelectItem value="any">Au moins un de ces produits</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher dans le portefeuille…"
            value={nomSearch}
            onChange={(e) => setNomSearch(e.target.value)}
          />
        </div>

        <div
          className={cn(
            "overflow-y-auto rounded-lg border divide-y",
            compact ? "max-h-32" : "max-h-44"
          )}
        >
          {loading ? (
            <p className="text-xs text-muted-foreground px-3 py-4 text-center">
              Chargement du portefeuille…
            </p>
          ) : filteredRows.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-4 text-center">
              {portfolioRows.length === 0
                ? "Aucun investissement nommé dans le CRM pour ces filtres."
                : "Aucun nom ne correspond à la recherche."}
            </p>
          ) : (
            filteredRows.map((row) => (
              <label
                key={row.nom_produit}
                className="flex items-start gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={nomInList(nomsProduit, row.nom_produit)}
                  onCheckedChange={() =>
                    toggleNomInList(row.nom_produit, nomsProduit, onNomsProduitChange)
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("font-medium leading-snug", compact && "text-xs")}>
                    {row.nom_produit}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {row.type_labels.slice(0, compact ? 2 : 3).map((label) => (
                      <span
                        key={label}
                        className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/80"
                      >
                        {label}
                      </span>
                    ))}
                    {row.type_labels.length > (compact ? 2 : 3) && (
                      <span>+{row.type_labels.length - (compact ? 2 : 3)}</span>
                    )}
                    <span className="ml-auto tabular-nums">{row.usage_count} dossier(s)</span>
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      {showEmptyWarning && !productFilterOptional && !hasSelection && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Sélectionnez au moins un type ou un nom pour définir la cible.
        </p>
      )}
    </>
  );

  if (variant === "card") {
    return (
      <div
        className={cn(
          "space-y-5 rounded-xl border bg-card px-4 py-4 shadow-sm",
          highlightInvalid && "ring-2 ring-destructive ring-offset-2 ring-offset-background"
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className={cn(
        compact ? "space-y-3" : "space-y-5",
        highlightInvalid &&
          "rounded-lg ring-2 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2"
      )}
    >
      {content}
    </div>
  );
}
