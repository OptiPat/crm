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
      <PopoverContent align="end" className="w-56 p-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1.5">
          Type d&apos;étiquette
        </p>
        <div className="space-y-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={onClassic}
          >
            <Tag className="h-4 w-4 mr-2 shrink-0" />
            Étiquette classique
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={onExceltis}
          >
            <Sparkles className="h-4 w-4 mr-2 shrink-0 text-amber-600" />
            Étiquette Exceltis
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
