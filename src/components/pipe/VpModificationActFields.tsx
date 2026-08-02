import { Checkbox } from "@/components/ui/checkbox";
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
  EMPTY_VP_MODIFICATION_ACT_VALUE,
  toggleVpModificationKind,
  type VpModificationActValue,
  type VpModificationKind,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";

const KIND_OPTIONS: { kind: VpModificationKind; label: string }[] = [
  { kind: "montant", label: "Montant" },
  { kind: "allocation", label: "Allocation" },
  { kind: "periodicite", label: "Périodicité" },
];

interface VpModificationActFieldsProps {
  value: VpModificationActValue;
  onChange: (value: VpModificationActValue) => void;
  disabled?: boolean;
  /** Suggestion du montant VP actuel (contrat CRM) quand « Montant » est coché. */
  suggestMontantEuros?: () => Promise<string>;
}

export function VpModificationActFields({
  value = EMPTY_VP_MODIFICATION_ACT_VALUE,
  onChange,
  disabled = false,
  suggestMontantEuros,
}: VpModificationActFieldsProps) {
  const setKind = (kind: VpModificationKind, checked: boolean) => {
    const kinds = toggleVpModificationKind(value.kinds, kind, checked);
    const next = { ...value, kinds };
    onChange(next);
    if (kind === "montant" && checked && !next.montantEuros.trim() && suggestMontantEuros) {
      void suggestMontantEuros().then((prefill) => {
        if (!prefill) return;
        onChange({ ...next, montantEuros: prefill });
      });
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed bg-muted/10 p-3">
      <div>
        <p className="text-sm font-medium">Modification concernée</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Cochez uniquement ce qui change sur la fiche conseil.
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        {KIND_OPTIONS.map(({ kind, label }) => (
          <label key={kind} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={value.kinds.includes(kind)}
              disabled={disabled}
              onCheckedChange={(checked) => setKind(kind, checked === true)}
            />
            {label}
          </label>
        ))}
      </div>
      {value.kinds.includes("montant") ? (
        <PlacementMontantField
          value={value.montantEuros}
          onChange={(montantEuros) => onChange({ ...value, montantEuros })}
          disabled={disabled}
          required={false}
          label="Nouveau montant VP (€)"
          placeholder="Ex. 150"
        />
      ) : null}
      {value.kinds.includes("periodicite") ? (
        <div className="space-y-2">
          <Label>Nouvelle périodicité</Label>
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
      ) : null}
    </div>
  );
}
