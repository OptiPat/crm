import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatTmiRateLabel,
  IR_NET_OPERATOR_LABELS,
  STANDARD_TMI_RATES,
  type IrNetOperator,
} from "@/lib/etiquettes/fiscal-tmi";
import { cn } from "@/lib/utils";

export function TmiTranchePicker({
  selected,
  onToggle,
  highlight,
}: {
  selected: number[];
  onToggle: (rate: number) => void;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-2",
        highlight && "rounded-lg ring-2 ring-destructive ring-offset-2 ring-offset-background p-1 -m-1"
      )}
    >
      {STANDARD_TMI_RATES.map((rate) => {
        const active = selected.includes(rate);
        return (
          <button
            key={rate}
            type="button"
            onClick={() => onToggle(rate)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted/50"
            )}
          >
            {formatTmiRateLabel(rate)}
          </button>
        );
      })}
    </div>
  );
}

export function IrNetConditionFields({
  operator,
  onOperatorChange,
  montant,
  onMontantChange,
  highlight,
}: {
  operator: IrNetOperator;
  onOperatorChange: (op: IrNetOperator) => void;
  montant: number | "";
  onMontantChange: (v: number | "") => void;
  highlight?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="ir-net-operator">Comparaison</Label>
        <Select value={operator} onValueChange={(v) => onOperatorChange(v as IrNetOperator)}>
          <SelectTrigger id="ir-net-operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(IR_NET_OPERATOR_LABELS) as IrNetOperator[]).map((op) => (
              <SelectItem key={op} value={op}>
                {IR_NET_OPERATOR_LABELS[op]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ir-net-montant">Montant (€)</Label>
        <Input
          id="ir-net-montant"
          type="number"
          min={0}
          step={1}
          value={montant}
          onChange={(e) => {
            const raw = e.target.value;
            onMontantChange(raw === "" ? "" : Math.max(0, parseFloat(raw) || 0));
          }}
          placeholder="Ex. 4000"
          className={cn(
            highlight &&
              "ring-2 ring-destructive ring-offset-2 ring-offset-background"
          )}
        />
      </div>
    </div>
  );
}
