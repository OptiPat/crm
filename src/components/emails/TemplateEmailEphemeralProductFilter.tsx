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
import { useNomProduitInvestissements } from "@/lib/investissements/use-nom-produit-investissements";
import type { EphemeralProduitsMatchMode } from "@/lib/emails/template-email-ephemeral";
import { cn } from "@/lib/utils";
import { Package, Search, X } from "lucide-react";

const TYPE_LABEL_BY_VALUE = Object.fromEntries(
  INVESTISSEMENT_TYPE_GROUPS.flatMap((g) => g.types.map((t) => [t.value, t.label]))
) as Record<string, string>;

type ProductPickerRow = {
  nom_produit: string;
  usage_count: number;
  type_labels: string[];
};

function nomInList(list: string[], nom: string): boolean {
  return list.some((n) => n.toLowerCase() === nom.toLowerCase());
}

function toggleNom(nom: string, list: string[], setList: (next: string[]) => void) {
  if (nomInList(list, nom)) {
    setList(list.filter((n) => n.toLowerCase() !== nom.toLowerCase()));
  } else {
    setList([...list, nom]);
  }
}

function buildProductPickerRows(
  investissements: { type_produit: string; nom_produit: string }[],
  typeFilters: string[]
): ProductPickerRow[] {
  const typeSet = typeFilters.length > 0 ? new Set(typeFilters) : null;
  const byNom = new Map<string, { nom_produit: string; usage_count: number; types: Set<string> }>();

  for (const inv of investissements) {
    if (typeSet && !typeSet.has(inv.type_produit)) continue;
    const trimmed = inv.nom_produit.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const existing = byNom.get(key);
    if (existing) {
      existing.usage_count += 1;
      existing.types.add(inv.type_produit);
    } else {
      byNom.set(key, {
        nom_produit: trimmed,
        usage_count: 1,
        types: new Set([inv.type_produit]),
      });
    }
  }

  return Array.from(byNom.values())
    .map(({ nom_produit, usage_count, types }) => ({
      nom_produit,
      usage_count,
      type_labels: [...types]
        .map((t) => TYPE_LABEL_BY_VALUE[t] ?? t)
        .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
    }))
    .sort(
      (a, b) =>
        b.usage_count - a.usage_count ||
        a.nom_produit.localeCompare(b.nom_produit, "fr", { sensitivity: "base" })
    );
}

type Props = {
  types: string[];
  nomsProduit: string[];
  produitsMatchMode: EphemeralProduitsMatchMode;
  onTypesChange: (next: string[]) => void;
  onNomsProduitChange: (next: string[]) => void;
  onProduitsMatchModeChange: (mode: EphemeralProduitsMatchMode) => void;
  highlightInvalid?: boolean;
};

export function TemplateEmailEphemeralProductFilter({
  types,
  nomsProduit,
  produitsMatchMode,
  onTypesChange,
  onNomsProduitChange,
  onProduitsMatchModeChange,
  highlightInvalid,
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

  const toggleType = (value: string) => {
    if (types.includes(value)) {
      onTypesChange(types.filter((t) => t !== value));
    } else {
      onTypesChange([...types, value]);
    }
  };

  return (
    <div
      className={cn(
        "space-y-5 rounded-xl border bg-card px-4 py-4 shadow-sm",
        highlightInvalid && "ring-2 ring-destructive ring-offset-2 ring-offset-background"
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Package className="h-4 w-4 text-primary shrink-0" />
          Patrimoine ciblé
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Choisissez au moins un <strong className="font-medium text-foreground">type</strong> ou un{" "}
          <strong className="font-medium text-foreground">nom de produit</strong>. Un contact est
          retenu s&apos;il détient un investissement qui correspond aux deux filtres actifs.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-sm">Types de produit</Label>
          <p className="text-xs text-muted-foreground">
            Facultatif — aucun type coché = tous les types du portefeuille.
          </p>
        </div>
        {INVESTISSEMENT_TYPE_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
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

      <div className="space-y-3 border-t pt-4">
        <div className="space-y-1">
          <Label className="text-sm">Noms de produit</Label>
          <p className="text-xs text-muted-foreground">
            Facultatif — cochez un ou plusieurs noms déjà présents sur des fiches investissement
            {types.length > 0 ? " (liste filtrée par les types cochés)" : ""}.
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

        {multipleNames && (
          <div className="space-y-2 rounded-md bg-muted/30 px-3 py-2.5">
            <Label className="text-xs">Plusieurs noms sélectionnés — le contact doit avoir</Label>
            <Select
              value={produitsMatchMode}
              onValueChange={(v) => onProduitsMatchModeChange(v as EphemeralProduitsMatchMode)}
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

        <div className="max-h-44 overflow-y-auto rounded-lg border divide-y">
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
                    toggleNom(row.nom_produit, nomsProduit, onNomsProduitChange)
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium leading-snug">{row.nom_produit}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {row.type_labels.slice(0, 3).map((label) => (
                      <span
                        key={label}
                        className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/80"
                      >
                        {label}
                      </span>
                    ))}
                    {row.type_labels.length > 3 && (
                      <span>+{row.type_labels.length - 3}</span>
                    )}
                    <span className="ml-auto tabular-nums">{row.usage_count} dossier(s)</span>
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      {!hasSelection && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Sélectionnez au moins un type ou un nom pour définir la cible.
        </p>
      )}
    </div>
  );
}
