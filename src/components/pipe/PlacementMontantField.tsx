import { useId } from "react";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";

interface PlacementMontantFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  placeholder?: string;
}

/** Montant en euros affiché « 70 000 » pendant la frappe ; valeur brute « 70000 » / « 70000.50 ». */
export function PlacementMontantField({
  value,
  onChange,
  disabled = false,
  required = true,
  label = "Montant souscrit (€)",
  placeholder = "Ex. 50 000",
}: PlacementMontantFieldProps) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      <MoneyInput
        id={id}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
    </div>
  );
}
