import { ChevronDown, Plus, Sparkles, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface EtiquetteCreateMenuProps {
  onClassic: () => void;
  onExceltis: () => void;
  size?: "default" | "sm";
  className?: string;
}

export function EtiquetteCreateMenu({
  onClassic,
  onExceltis,
  size = "default",
  className,
}: EtiquetteCreateMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size={size} className={cn("gap-2", className)}>
          <Plus className="h-4 w-4" />
          Nouvelle étiquette
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1.5">
          Type d&apos;étiquette
        </p>
        <div className="space-y-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full h-auto py-2 px-2 flex flex-col items-start gap-1 whitespace-normal text-left"
            onClick={onClassic}
          >
            <span className="flex items-center gap-2 w-full min-w-0">
              <Tag className="h-4 w-4 shrink-0" />
              <span className="font-medium leading-snug">Étiquette classique</span>
            </span>
            <span className="text-[11px] text-muted-foreground font-normal pl-6 leading-snug break-words">
              Manuelle, règle auto ou campagne email
            </span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full h-auto py-2 px-2 flex flex-col items-start gap-1 whitespace-normal text-left"
            onClick={onExceltis}
          >
            <span className="flex items-center gap-2 w-full min-w-0">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="font-medium leading-snug">Étiquette Exceltis</span>
            </span>
            <span className="text-[11px] text-muted-foreground font-normal pl-6 leading-snug break-words">
              Campagne Stellium / signaux patrimoniaux
            </span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
