import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { INVESTISSEMENT_TYPE_GROUPS } from "@/lib/etiquettes/etiquette-investissement-types";
import { buildDistinctNomProduits } from "@/lib/investissements/nom-produit-suggestions";
import { useNomProduitInvestissements } from "@/lib/investissements/use-nom-produit-investissements";

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
};

function nomInList(list: string[], nom: string): boolean {
  const key = nom.toLowerCase();
  return list.some((n) => n.toLowerCase() === key);
}

function toggleInList(value: string, list: string[], setList: (next: string[]) => void) {
  if (nomInList(list, value)) {
    setList(list.filter((n) => n.toLowerCase() !== value.toLowerCase()));
  } else {
    setList([...list, value]);
  }
}

export function TypeProduitConditionFields({
  types,
  nomsProduit,
  onTypesChange,
  onNomsProduitChange,
  typesFieldId,
  typesFieldHighlight,
  highlightInvalid,
  compact = false,
}: Props) {
  const { investissements, loading: loadingInvestissements } = useNomProduitInvestissements();
  const [nomSearch, setNomSearch] = useState("");
  const [customNom, setCustomNom] = useState("");

  const suggestions = useMemo(
    () => buildDistinctNomProduits(investissements, types.length > 0 ? types : undefined),
    [investissements, types]
  );

  const filteredSuggestions = useMemo(() => {
    const q = nomSearch.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.nom_produit.toLowerCase().includes(q));
  }, [suggestions, nomSearch]);

  const addCustomNom = () => {
    const trimmed = customNom.trim();
    if (!trimmed) return;
    if (!nomsProduit.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      onNomsProduitChange([...nomsProduit, trimmed]);
    }
    setCustomNom("");
  };

  return (
    <div
      className={cn(
        "space-y-4",
        compact && "space-y-3",
        highlightInvalid &&
          "rounded-lg ring-2 ring-destructive ring-offset-2 ring-offset-background p-2 -m-2"
      )}
    >
      <div className="space-y-2">
        <Label>Types de produits (optionnel)</Label>
        <div
          id={typesFieldId}
          className={cn(
            compact
              ? "flex flex-wrap gap-2 max-h-32 overflow-y-auto"
              : "max-h-40 overflow-y-auto border rounded-md p-2 space-y-2",
            typesFieldHighlight &&
              "ring-2 ring-destructive ring-offset-2 ring-offset-background"
          )}
        >
          {INVESTISSEMENT_TYPE_GROUPS.map((group) => (
            <div key={group.label}>
              {!compact && (
                <p className="text-xs font-semibold text-muted-foreground">{group.label}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {group.types.map((t) => (
                  <div key={t.value} className="flex items-center gap-1.5">
                    <Checkbox
                      id={typesFieldId ? `${typesFieldId}-${t.value}` : `type-${t.value}`}
                      checked={types.includes(t.value)}
                      onCheckedChange={() => toggleInList(t.value, types, onTypesChange)}
                    />
                    <Label
                      htmlFor={typesFieldId ? `${typesFieldId}-${t.value}` : `type-${t.value}`}
                      className="text-xs font-normal cursor-pointer"
                    >
                      {t.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Noms de produit (optionnel)</Label>
        <p className="text-xs text-muted-foreground">
          Au moins un type ou un nom requis. Les deux filtres se cumulent (ET) sur le même
          investissement.
        </p>
        {nomsProduit.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {nomsProduit.map((nom) => (
              <Badge key={nom} variant="secondary" className="gap-1 pr-1">
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
        <Input
          placeholder="Rechercher un nom dans le portefeuille…"
          value={nomSearch}
          onChange={(e) => setNomSearch(e.target.value)}
        />
        <div className="max-h-36 overflow-y-auto border rounded-md p-2 space-y-1">
          {filteredSuggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-2">
              {loadingInvestissements
                ? "Chargement du portefeuille…"
                : `Aucun nom trouvé${types.length > 0 ? " pour les types sélectionnés" : ""}.`}
            </p>
          ) : (
            filteredSuggestions.map((s) => (
              <label
                key={s.nom_produit}
                className="flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-0.5 hover:bg-muted/60"
              >
                <Checkbox
                  checked={nomInList(nomsProduit, s.nom_produit)}
                  onCheckedChange={() =>
                    toggleInList(s.nom_produit, nomsProduit, onNomsProduitChange)
                  }
                />
                <span className="flex-1 truncate">{s.nom_produit}</span>
                <span className="text-muted-foreground shrink-0">×{s.usage_count}</span>
              </label>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Ajouter un nom manuellement…"
            value={customNom}
            onChange={(e) => setCustomNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomNom();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addCustomNom}>
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  );
}
