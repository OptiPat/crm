import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StelliumPlacementActFields } from "@/components/pipe/StelliumPlacementActFields";
import { PlacementMontantField } from "@/components/pipe/PlacementMontantField";
import { isVersementComplementaireActLabel } from "@/lib/pipe/pipe-suivi";

export interface SuiviStelliumActRow {
  key: string;
  productLabel: string;
  actLabel: string;
  montantEuros: string;
}

function newActRow(): SuiviStelliumActRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productLabel: "",
    actLabel: "",
    montantEuros: "",
  };
}

export function createInitialSuiviStelliumActs(): SuiviStelliumActRow[] {
  return [newActRow()];
}

interface SuiviStelliumActsFormProps {
  acts: SuiviStelliumActRow[];
  onChange: (acts: SuiviStelliumActRow[]) => void;
  disabled?: boolean;
}

export function SuiviStelliumActsForm({ acts, onChange, disabled = false }: SuiviStelliumActsFormProps) {
  const updateAct = (key: string, patch: Partial<Pick<SuiviStelliumActRow, "productLabel" | "actLabel" | "montantEuros">>) => {
    onChange(
      acts.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
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
            onProductChange={(productLabel) => updateAct(row.key, { productLabel })}
            onStelliumLabelChange={(actLabel) => updateAct(row.key, { actLabel })}
            disabled={disabled}
          />
          {isVersementComplementaireActLabel(row.actLabel) ? (
            <PlacementMontantField
              value={row.montantEuros}
              onChange={(montantEuros) => updateAct(row.key, { montantEuros })}
              disabled={disabled}
            />
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
