import { Checkbox } from "@/components/ui/checkbox";

interface PipeR2ConfirmationEmailToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function PipeR2ConfirmationEmailToggle({
  checked,
  onCheckedChange,
  disabled = false,
}: PipeR2ConfirmationEmailToggleProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span>
        <span className="font-medium">Envoyer le mail de confirmation</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Un R2 est déjà sur cette affaire. Décochez pour ne pas renvoyer le même mail.
          L&apos;invitation Google Agenda part dans tous les cas.
        </span>
      </span>
    </label>
  );
}
