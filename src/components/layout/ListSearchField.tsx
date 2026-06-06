import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ListSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
};

export function ListSearchField({
  value,
  onChange,
  placeholder = "Rechercher…",
  className,
  inputClassName,
  "aria-label": ariaLabel = "Rechercher dans la liste",
}: ListSearchFieldProps) {
  return (
    <div className={cn("relative min-w-[200px]", className)}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
        aria-hidden
      />
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("pl-9 pr-9", inputClassName)}
        aria-label={ariaLabel}
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
          onClick={() => onChange("")}
          aria-label="Effacer la recherche"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
