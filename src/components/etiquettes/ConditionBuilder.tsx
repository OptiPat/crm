import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { RuleLeaf, RuleOp } from "@/lib/etiquettes/rule-ast";
import {
  CONDITION_TYPE_LABELS,
  type ConditionType,
} from "@/lib/etiquettes/etiquette-condition-labels";
import { RuleLeafFields } from "@/components/etiquettes/RuleLeafFields";
import { SegmentRulePreview } from "@/components/etiquettes/SegmentRulePreview";
import { buildTypeProduitConditionConfig } from "@/lib/etiquettes/type-produit-condition";
import type { CustomFieldDef } from "@/lib/api/tauri-custom-fields";

const CONDITION_TYPES: ConditionType[] = [
  "DELAI_SANS_CONTACT",
  "DATE_APPROCHE",
  "PERIODE_ANNEE",
  "TYPE_PRODUIT",
  "DATE_APPROCHE_INVESTISSEMENT",
  "AGE_APPROCHE",
  "TMI",
  "IR_NET",
  "REVENUS_ANNUELS",
  "JAMAIS_CONTACT",
  "A_ETIQUETTE",
];

function newLeaf(
  type: ConditionType = "DELAI_SANS_CONTACT",
  customFieldsOptions: CustomFieldDef[] = []
): RuleLeaf {
  const config: Record<string, unknown> =
    type === "DELAI_SANS_CONTACT"
      ? { jours: 365, inclure_sans_date: true }
      : type === "JAMAIS_CONTACT"
        ? {}
        : type === "A_ETIQUETTE"
          ? { etiquette_id: 0, present: true }
          : type === "TYPE_PRODUIT"
            ? buildTypeProduitConditionConfig([], [])
            : type === "PERIODE_ANNEE"
              ? { mois_debut: 4, mois_fin: 5 }
              : type === "DATE_APPROCHE"
                ? { champ: "date_prochain_suivi", jours_avant: 30 }
                : type === "DATE_APPROCHE_INVESTISSEMENT"
                  ? {
                      champ: "date_fin_demembrement",
                      jours_avant: 180,
                      types_produit: ["SCPI_DEMEMBREMENT"],
                    }
                  : type === "AGE_APPROCHE"
                    ? { age: 69, jours_avant: 30 }
                    : type === "TMI"
                      ? { tranches: [11] }
                      : type === "IR_NET"
                        ? { operator: "gte", montant: 4000 }
                        : type === "REVENUS_ANNUELS"
                          ? { operator: "gte", montant: 60_000 }
                          : type === "CHAMP_PERSO"
                      ? {
                          field_key: customFieldsOptions[0]?.field_key ?? "",
                          operator: "rempli",
                          value: "",
                        }
                      : {};
  return {
    type,
    config,
    categories: ["CLIENT"],
  };
}

export interface ConditionBuilderProps {
  op: RuleOp;
  onOpChange: (op: RuleOp) => void;
  children: RuleLeaf[];
  onChange: (children: RuleLeaf[]) => void;
  etiquettesOptions?: { id: number; nom: string }[];
  customFieldsOptions?: CustomFieldDef[];
  showPreview?: boolean;
  previewSelectable?: boolean;
  excludedContactIds?: number[];
  onExcludedContactIdsChange?: (ids: number[]) => void;
  highlightRuleLeafIndex?: number | null;
}

export function ConditionBuilder({
  op,
  onOpChange,
  children,
  onChange,
  etiquettesOptions = [],
  customFieldsOptions = [],
  showPreview = true,
  previewSelectable = false,
  excludedContactIds = [],
  onExcludedContactIdsChange,
  highlightRuleLeafIndex = null,
}: ConditionBuilderProps) {
  const availableTypes: ConditionType[] =
    customFieldsOptions.length > 0
      ? [...CONDITION_TYPES, "CHAMP_PERSO"]
      : CONDITION_TYPES;
  return (
    <div className="space-y-4 rounded-xl border p-4 sm:p-5 bg-muted/20">
      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-sm shrink-0">Combiner avec</Label>
        <Select value={op} onValueChange={(v) => onOpChange(v as RuleOp)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">ET (toutes)</SelectItem>
            <SelectItem value="or">OU (au moins une)</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => onChange([...children, newLeaf("DELAI_SANS_CONTACT", customFieldsOptions)])}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Condition
        </Button>
      </div>

      {children.map((leaf, index) => (
        <div
          key={index}
          id={`rule-leaf-${index}`}
          className={
            highlightRuleLeafIndex === index
              ? "space-y-3 rounded-lg border bg-background p-4 sm:p-5 ring-2 ring-destructive ring-offset-2 ring-offset-background"
              : "space-y-3 rounded-lg border bg-background p-4 sm:p-5"
          }
        >
          <div className="flex items-center justify-between gap-2">
            <Select
              value={leaf.type}
              onValueChange={(t) =>
                onChange(
                  children.map((c, i) =>
                    i === index ? newLeaf(t as ConditionType, customFieldsOptions) : c
                  )
                )
              }
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CONDITION_TYPE_LABELS[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {children.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(children.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
          <RuleLeafFields
            leaf={leaf}
            onChange={(next) => onChange(children.map((c, i) => (i === index ? next : c)))}
            etiquettesOptions={etiquettesOptions}
            customFieldsOptions={customFieldsOptions}
            highlightInvalid={highlightRuleLeafIndex === index}
          />
        </div>
      ))}

      {showPreview && children.length > 0 && (
        <SegmentRulePreview
          op={op}
          children={children}
          selectable={previewSelectable}
          excludedContactIds={excludedContactIds}
          onExcludedContactIdsChange={onExcludedContactIdsChange}
          listTitle={
            previewSelectable ? "Contacts du déclencheur" : "Contacts concernés par la règle"
          }
        />
      )}
    </div>
  );
}
