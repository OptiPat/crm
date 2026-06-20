import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Filter } from "lucide-react";

export type MultiFilterOption = { value: string; label: string };

export function InvestissementMultiFilterSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  placeholder: string;
  options: MultiFilterOption[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}) {
  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? "1 sélection")
        : `${value.length} sélectionnés`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full sm:w-[200px] justify-between gap-2 font-normal",
            value.length > 0 && "border-primary/40 bg-primary/5",
            className
          )}
        >
          <span className="truncate text-left">{summary}</span>
          <Filter className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          {value.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => onChange([])}
            >
              Effacer
            </Button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
            >
              <Checkbox
                checked={value.includes(opt.value)}
                onCheckedChange={() => toggle(opt.value)}
              />
              <span className="leading-tight">{opt.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const INVESTISSEMENT_TYPE_FILTER_OPTIONS: MultiFilterOption[] = [
  { value: "SCPI", label: "SCPI" },
  { value: "SCPI_DEMEMBREMENT", label: "SCPI démembrement" },
  { value: "ASSURANCE_VIE", label: "Assurance vie" },
  { value: "PER", label: "PER" },
  { value: "IMMOBILIER", label: "Immobilier (Pinel, Malraux…)" },
  { value: "FIP_FCPI", label: "FIP / FCPI" },
  { value: "FCPR", label: "FCPR / FPCI" },
  { value: "G3F", label: "G3F" },
  { value: "AUTRE", label: "Autre" },
];
