import { Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatRdvPlanOptionLabel,
  planOptionsForRdvStage,
  stageHasPlanVariants,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { cn } from "@/lib/utils";

interface PipeRdvPlanStageButtonProps {
  stage: PipeRdvStage;
  onSelect: (option: PipeRdvPlanOption) => void;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /** Libellé court (ex. stepper actif) sans le préfixe « Planifier le RDV ». */
  compact?: boolean;
  /** Remplace « Planifier le RDV {étape} » (ex. planifier un second R2). */
  actionLabel?: string;
}

export function PipeRdvPlanStageButton({
  stage,
  onSelect,
  variant = "outline",
  size = "sm",
  className,
  compact = false,
  actionLabel,
}: PipeRdvPlanStageButtonProps) {
  const label = PIPE_STAGE_LABELS[stage];
  const options = planOptionsForRdvStage(stage);
  const buttonText =
    actionLabel ?? (compact ? label : `Planifier le RDV ${label}`);

  if (!stageHasPlanVariants(stage)) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn("gap-1.5", className)}
        onClick={() => onSelect(stage)}
      >
        <Calendar className="h-3.5 w-3.5" />
        {buttonText}
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={cn("gap-1.5", className)}
          aria-label={actionLabel ?? (compact ? `Planifier ${label}` : `Planifier le RDV ${label}`)}
        >
          <Calendar className="h-3.5 w-3.5" />
          {buttonText}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <p className="mb-2 px-1 text-xs text-muted-foreground">Type de {label}</p>
        <div className="flex flex-col gap-1">
          {options.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 justify-start text-xs"
              onClick={() => onSelect(option)}
            >
              {formatRdvPlanOptionLabel(option)}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
