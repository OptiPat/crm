import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Champ date dossier réseau (non contrôlé, sauvegarde au blur) — module Organisation + fiche contact. */
export function FilleulDossierDateField({
  id,
  label,
  value,
  disabled,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onSave: (value: string) => void | Promise<void>;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        className="h-9"
        defaultValue={value}
        disabled={disabled}
        key={`${id}-${value}`}
        onBlur={(event) => {
          if (event.target.value === value) return;
          void onSave(event.target.value);
        }}
      />
    </div>
  );
}
