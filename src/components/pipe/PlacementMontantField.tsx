import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PlacementMontantFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}

export function PlacementMontantField({
  value,
  onChange,
  disabled = false,
  required = true,
}: PlacementMontantFieldProps) {
  return (
    <div className="space-y-2">
      <Label>
        Montant souscrit (€)
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      <Input
        type="text"
        inputMode="decimal"
        placeholder="Ex. 50 000"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
