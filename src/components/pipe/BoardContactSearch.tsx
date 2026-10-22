import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface BoardContactSearchProps {
  value: string;
  onChange: (value: string) => void;
  resultCount?: number;
  className?: string;
}

/** Champ « Rechercher un contact » au-dessus des tableaux en colonnes. */
export function BoardContactSearch({
  value,
  onChange,
  resultCount,
  className,
}: BoardContactSearchProps) {
  const active = value.trim().length > 0;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative w-full max-w-xs">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && active) {
              e.stopPropagation();
              onChange("");
            }
          }}
          placeholder="Rechercher un contact"
          aria-label="Rechercher un contact"
          className="h-9 pl-8 pr-8"
        />
        {active ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Effacer la recherche"
            title="Effacer la recherche"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {active && resultCount != null ? (
        <span className="text-xs text-muted-foreground">
          {resultCount === 0
            ? "Aucun contact trouvé"
            : `${resultCount} résultat${resultCount > 1 ? "s" : ""}`}
        </span>
      ) : null}
    </div>
  );
}

/** Recherche sans résultat : distingue « aucun résultat » d'un tableau vide. */
export function BoardContactSearchEmpty({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p className="text-sm font-medium">Aucun contact ne correspond à « {query.trim()} »</p>
      <Button type="button" variant="outline" size="sm" onClick={onClear}>
        Effacer la recherche
      </Button>
    </div>
  );
}
