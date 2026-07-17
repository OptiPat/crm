import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatRdvPlanOptionLabel,
  PIPE_RDV_PLAN_OPTIONS,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";

interface PipeAffaireRdvPlanSelectProps {
  value: PipeRdvPlanOption;
  onValueChange: (value: PipeRdvPlanOption) => void;
  disabled?: boolean;
  id?: string;
}

export function PipeAffaireRdvPlanSelect({
  value,
  onValueChange,
  disabled = false,
  id,
}: PipeAffaireRdvPlanSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as PipeRdvPlanOption)}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Choisir…" />
      </SelectTrigger>
      <SelectContent>
        {PIPE_RDV_PLAN_OPTIONS.map((option) => (
          <SelectItem key={option} value={option}>
            {formatRdvPlanOptionLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
