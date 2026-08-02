import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlacementMontantField } from "@/components/pipe/PlacementMontantField";
import {
  EMPTY_VP_MISE_EN_PLACE_ACT_VALUE,
  type VpMiseEnPlaceActValue,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-types";

interface VpMiseEnPlaceActFieldsProps {
  value: VpMiseEnPlaceActValue;
  onChange: (value: VpMiseEnPlaceActValue) => void;
  disabled?: boolean;
}

export function VpMiseEnPlaceActFields({
  value = EMPTY_VP_MISE_EN_PLACE_ACT_VALUE,
  onChange,
  disabled = false,
}: VpMiseEnPlaceActFieldsProps) {
  return (
    <div className="space-y-3 rounded-md border border-dashed bg-muted/10 p-3">
      <div>
        <p className="text-sm font-medium">Mise en place des versements programmés</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Montant et périodicité reportés sur la fiche conseil (section mise en place).
        </p>
      </div>
      <PlacementMontantField
        value={value.montantEuros}
        onChange={(montantEuros) => onChange({ ...value, montantEuros })}
        disabled={disabled}
        required={false}
        label="Montant VP (€)"
        placeholder="Ex. 100"
      />
      <div className="space-y-2">
        <Label>Périodicité</Label>
        <Select
          value={value.frequence}
          onValueChange={(frequence) => onChange({ ...value, frequence })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sélectionner…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MENSUEL">Mensuel</SelectItem>
            <SelectItem value="TRIMESTRIEL">Trimestriel</SelectItem>
            <SelectItem value="SEMESTRIEL">Semestriel</SelectItem>
            <SelectItem value="ANNUEL">Annuel</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
