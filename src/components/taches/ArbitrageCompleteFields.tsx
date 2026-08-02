import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import { defaultProchainArbitrageDateInput } from "@/lib/alertes/arbitrage-alerte";

export interface ArbitrageCompleteFieldsProps {
  dateDernier: string;
  dateProchain: string;
  note: string;
  onDateDernierChange: (value: string) => void;
  onDateProchainChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}

export function ArbitrageCompleteFields({
  dateDernier,
  dateProchain,
  note,
  onDateDernierChange,
  onDateProchainChange,
  onNoteChange,
  disabled = false,
  idPrefix = "arbitrage",
}: ArbitrageCompleteFieldsProps) {
  const handleDernierChange = (value: string) => {
    onDateDernierChange(value);
    if (value) {
      onDateProchainChange(defaultProchainArbitrageDateInput(value));
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-date-dernier`}>Date du dernier arbitrage</Label>
        <Input
          id={`${idPrefix}-date-dernier`}
          type="date"
          value={dateDernier}
          onChange={(e) => handleDernierChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-date-prochain`}>Date du prochain arbitrage</Label>
        <Input
          id={`${idPrefix}-date-prochain`}
          type="date"
          value={dateProchain}
          onChange={(e) => onDateProchainChange(e.target.value)}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Par défaut : 6 mois après la date du dernier arbitrage. Ajustez si besoin.
        </p>
      </div>
      <DictationTextarea
        id={`${idPrefix}-note`}
        label="Note"
        value={note}
        onChange={onNoteChange}
        placeholder="Compte-rendu de l'arbitrage…"
        rows={3}
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">
        Enregistrée dans l&apos;historique du contact (une note par arbitrage).
      </p>
    </div>
  );
}
