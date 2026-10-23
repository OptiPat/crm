import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  acceptsReinvestissementDividendes,
  acceptsVersementProgramme,
  FREQUENCE_VERSEMENT_LABELS,
} from "@/lib/investissements/investissement-versements";
import {
  resolveSouscriptionHolderKey,
  souscriptionHolderFieldVisible,
  type SouscriptionExtrasValue,
  type SouscriptionHolderChoices,
  type SouscriptionHolderKey,
} from "@/lib/placement/souscription-details";

interface SouscriptionDetailsFieldsProps {
  choices: SouscriptionHolderChoices | null;
  holderKey: SouscriptionHolderKey | null;
  onHolderChange: (key: SouscriptionHolderKey) => void;
  typeProduit: string | null | undefined;
  extras: SouscriptionExtrasValue;
  onExtrasChange: (value: SouscriptionExtrasValue) => void;
  disabled?: boolean;
}

/** Titulaire + versement programmé + réinvestissement des dividendes (souscription affaire). */
export function SouscriptionDetailsFields({
  choices,
  holderKey,
  onHolderChange,
  typeProduit,
  extras,
  onExtrasChange,
  disabled = false,
}: SouscriptionDetailsFieldsProps) {
  const showHolder = choices != null && souscriptionHolderFieldVisible(choices);
  const selectedHolder = resolveSouscriptionHolderKey(holderKey, choices);
  const showVp = acceptsVersementProgramme(typeProduit);
  const showReinvest = acceptsReinvestissementDividendes(typeProduit);
  const patch = (next: Partial<SouscriptionExtrasValue>) => onExtrasChange({ ...extras, ...next });
  const uid = useId();
  const holderLabelId = `${uid}-titulaire`;
  const vpCheckboxId = `${uid}-vp`;
  const vpMontantId = `${uid}-vp-montant`;
  const vpFrequenceId = `${uid}-vp-frequence`;
  const reinvestId = `${uid}-reinvest`;
  const reinvestHelpId = `${uid}-reinvest-aide`;

  return (
    <>
      {showHolder ? (
        <div className="space-y-2">
          <Label id={holderLabelId}>Titulaire</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby={holderLabelId}>
            {choices.options.map((option) => (
              <Button
                key={option.key}
                type="button"
                size="sm"
                variant={selectedHolder === option.key ? "default" : "outline"}
                disabled={disabled}
                aria-pressed={selectedHolder === option.key}
                onClick={() => onHolderChange(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {showVp ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={vpCheckboxId}
              checked={extras.vpEnabled}
              disabled={disabled}
              onCheckedChange={(checked) => patch({ vpEnabled: checked === true })}
            />
            <Label htmlFor={vpCheckboxId}>Versement programmé</Label>
          </div>
          {extras.vpEnabled ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={vpMontantId} className="text-xs">
                  Montant (€)
                </Label>
                <MoneyInput
                  id={vpMontantId}
                  value={extras.vpMontantEuros}
                  onValueChange={(raw) => patch({ vpMontantEuros: raw })}
                  placeholder="Ex. 200"
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={vpFrequenceId} className="text-xs">
                  Fréquence
                </Label>
                <Select
                  value={extras.vpFrequence}
                  onValueChange={(value) => patch({ vpFrequence: value })}
                  disabled={disabled}
                >
                  <SelectTrigger id={vpFrequenceId}>
                    <SelectValue placeholder="Sélectionnez" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCE_VERSEMENT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {showReinvest ? (
        <div className="space-y-1">
          <Label htmlFor={reinvestId}>Réinvestissement des dividendes (%)</Label>
          <div className="flex items-center gap-2">
            <Input
              id={reinvestId}
              aria-describedby={reinvestHelpId}
              type="number"
              min={1}
              max={100}
              step={1}
              className="w-24"
              placeholder="—"
              value={extras.reinvestPct}
              disabled={disabled}
              onChange={(e) => patch({ reinvestPct: e.target.value })}
            />
            <span id={reinvestHelpId} className="text-xs text-muted-foreground">
              Laisser vide si aucun réinvestissement.
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
