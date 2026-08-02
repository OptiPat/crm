import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StelliumPlacementActFields } from "@/components/pipe/StelliumPlacementActFields";
import { PlacementMontantField } from "@/components/pipe/PlacementMontantField";
import { VpModificationActFields } from "@/components/pipe/VpModificationActFields";
import { ArbitrageFicheConseilButton } from "@/components/fiche-conseil/ArbitrageFicheConseilButton";
import {
  isStelliumActEligibleForFicheConseil,
  isVpModificationStelliumAct,
} from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-stellium";
import { loadVpModificationMontantEurosPrefill } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-prefill";
import {
  EMPTY_VP_MODIFICATION_ACT_VALUE,
  toVpModificationPdfFillInput,
  type VpModificationActValue,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";
import { isVersementComplementaireActLabel } from "@/lib/pipe/pipe-suivi";

export interface SuiviStelliumActRow {
  key: string;
  productLabel: string;
  actLabel: string;
  montantEuros: string;
  vpModification: VpModificationActValue;
}

function newActRow(): SuiviStelliumActRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productLabel: "",
    actLabel: "",
    montantEuros: "",
    vpModification: { ...EMPTY_VP_MODIFICATION_ACT_VALUE },
  };
}

export function createInitialSuiviStelliumActs(): SuiviStelliumActRow[] {
  return [newActRow()];
}

interface SuiviStelliumActsFormProps {
  acts: SuiviStelliumActRow[];
  onChange: (acts: SuiviStelliumActRow[]) => void;
  disabled?: boolean;
  contactId?: number;
  onFicheConseil?: (
    actLabel: string,
    productLabel: string,
    options?: { vpModification?: ReturnType<typeof toVpModificationPdfFillInput> }
  ) => void;
  ficheConseilDisabled?: boolean;
}

export function SuiviStelliumActsForm({
  acts,
  onChange,
  disabled = false,
  contactId,
  onFicheConseil,
  ficheConseilDisabled = false,
}: SuiviStelliumActsFormProps) {
  const updateAct = (
    key: string,
    patch: Partial<Pick<SuiviStelliumActRow, "productLabel" | "actLabel" | "montantEuros" | "vpModification">>
  ) => {
    onChange(acts.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeAct = (key: string) => {
    if (acts.length <= 1) return;
    onChange(acts.filter((row) => row.key !== key));
  };

  const addAct = () => {
    onChange([...acts, newActRow()]);
  };

  return (
    <div className="space-y-4">
      {acts.map((row, index) => (
        <div key={row.key} className="space-y-3 rounded-md border bg-card/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Acte {index + 1}
              {isVersementComplementaireActLabel(row.actLabel) ? " — affaire enfant" : ""}
            </p>
            {acts.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label="Retirer cet acte"
                disabled={disabled}
                onClick={() => removeAct(row.key)}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            ) : null}
          </div>
          <StelliumPlacementActFields
            suivi
            productLabel={row.productLabel}
            stelliumLabel={row.actLabel}
            onProductChange={(productLabel) => {
              updateAct(row.key, { productLabel });
            }}
            onStelliumLabelChange={(actLabel) => {
              updateAct(row.key, {
                actLabel,
                vpModification: isVpModificationStelliumAct(actLabel)
                  ? row.vpModification
                  : { ...EMPTY_VP_MODIFICATION_ACT_VALUE },
              });
            }}
            disabled={disabled}
          />
          {isVersementComplementaireActLabel(row.actLabel) ? (
            <PlacementMontantField
              value={row.montantEuros}
              onChange={(montantEuros) => updateAct(row.key, { montantEuros })}
              disabled={disabled}
            />
          ) : isVpModificationStelliumAct(row.actLabel) ? (
            <VpModificationActFields
              value={row.vpModification}
              disabled={disabled}
              suggestMontantEuros={
                contactId && row.productLabel.trim()
                  ? () => loadVpModificationMontantEurosPrefill(contactId, row.productLabel)
                  : undefined
              }
              onChange={(vpModification) => {
                updateAct(row.key, { vpModification });
              }}
            />
          ) : null}
          {contactId &&
          onFicheConseil &&
          isStelliumActEligibleForFicheConseil(row.actLabel, row.productLabel) ? (
            <div className="flex justify-end">
              <ArbitrageFicheConseilButton
                disabled={disabled || ficheConseilDisabled}
                onClick={() =>
                  onFicheConseil(row.actLabel, row.productLabel, {
                    vpModification: toVpModificationPdfFillInput(row.vpModification),
                  })
                }
              />
            </div>
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1 text-xs"
        disabled={disabled}
        onClick={addAct}
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter un acte
      </Button>
    </div>
  );
}
