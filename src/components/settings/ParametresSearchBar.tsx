import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  filterParametresSearch,
  type ParametresSearchItem,
} from "@/lib/settings/parametres-search";

type ParametresSearchBarProps = {
  onSelect: (item: ParametresSearchItem) => void;
  className?: string;
};

export function ParametresSearchBar({ onSelect, className }: ParametresSearchBarProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => filterParametresSearch(query), [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const handleSelect = (item: ParametresSearchItem) => {
    onSelect(item);
    setQuery("");
    setOpen(false);
  };

  const showResults = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Rechercher un réglage…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showResults || results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const item = results[activeIndex];
              if (item) handleSelect(item);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="pl-9 pr-9"
          aria-label="Rechercher un réglage"
          aria-expanded={showResults}
          aria-controls="parametres-search-results"
          role="combobox"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            aria-label="Effacer la recherche"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showResults && (
        <ul
          id="parametres-search-results"
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">Aucun réglage trouvé</li>
          ) : (
            results.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-2.5 text-left text-sm transition-colors",
                    index === activeIndex ? "bg-muted" : "hover:bg-muted/70"
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleSelect(item)}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.externalPage && (
                    <span className="text-xs text-muted-foreground mt-0.5">
                      Page {item.externalPage === "newsletter" ? "Newsletter" : "Comptabilité"}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
