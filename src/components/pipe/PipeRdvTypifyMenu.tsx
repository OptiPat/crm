import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatRdvPlanOptionLabel,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";

interface PipeRdvTypifyMenuProps {
  disabled?: boolean;
  stageLabel: string;
  targets: readonly PipeRdvPlanOption[];
  onTypify: (target: PipeRdvPlanOption) => void | Promise<void>;
}

export function PipeRdvTypifyMenu({
  disabled = false,
  stageLabel,
  targets,
  onTypify,
}: PipeRdvTypifyMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={disabled}
          aria-label={`Typifier le RDV ${stageLabel}`}
        >
          <Tag className="h-3.5 w-3.5" />
          Typifier
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="end">
        <p className="mb-2 px-1 text-xs text-muted-foreground">Choisir le type de {stageLabel}</p>
        <div className="flex flex-col gap-1">
          {targets.map((target) => (
            <Button
              key={target}
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 justify-start text-xs"
              onClick={() => void onTypify(target)}
            >
              {formatRdvPlanOptionLabel(target)}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
