import { CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  PLACEMENT_OPERATION_TYPE_OPTIONS,
  type TemplateEmailPlacementConformeTriggerConfig,
} from "@/lib/emails/template-email-placement-conforme";
import { placementOperationTypeLabel } from "@/lib/placement/placement-operations-ui";

export type TemplatePlacementConformeDraft = {
  trigger: TemplateEmailPlacementConformeTriggerConfig;
};

type Props = {
  draft: TemplatePlacementConformeDraft;
  onChange: (next: TemplatePlacementConformeDraft) => void;
};

export function TemplateEmailPlacementConformePanel({ draft, onChange }: Props) {
  const patchTrigger = (partial: Partial<TemplateEmailPlacementConformeTriggerConfig>) =>
    onChange({ trigger: { ...draft.trigger, ...partial } });

  const toggleOperationType = (type: (typeof PLACEMENT_OPERATION_TYPE_OPTIONS)[number], checked: boolean) => {
    const operation_types = checked
      ? [...new Set([...draft.trigger.operation_types, type])]
      : draft.trigger.operation_types.filter((t) => t !== type);
    patchTrigger({ operation_types });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-teal-50/80 px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-900">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Label htmlFor="placement-conforme-trigger" className="text-sm font-medium">
              Email client — opération conforme (Box Placement)
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Envoyé automatiquement quand une opération partenaire passe en conforme (scan mail
              Stellium ou marquage manuel). Rédigez le message dans les onglets Message et
              Tutoiement — aucun texte n&apos;est imposé par le CRM.
            </p>
          </div>
        </div>
        <Switch
          id="placement-conforme-trigger"
          checked={draft.trigger.enabled}
          onCheckedChange={(checked) => patchTrigger({ enabled: checked })}
        />
      </div>

      {draft.trigger.enabled && (
        <div className="space-y-3 rounded-lg border p-4">
          <Label className="text-sm font-medium">Types d&apos;opération couverts</Label>
          <div className="flex flex-wrap gap-4">
            {PLACEMENT_OPERATION_TYPE_OPTIONS.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.trigger.operation_types.includes(type)}
                  onCheckedChange={(checked) =>
                    toggleOperationType(type, checked === true)
                  }
                />
                <span>{placementOperationTypeLabel(type)}</span>
              </label>
            ))}
          </div>
          {draft.trigger.operation_types.length === 0 && (
            <p className="text-xs text-amber-700">
              Sélectionnez au moins un type pour activer l&apos;envoi.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Variables dédiées :{" "}
            <code className="text-[11px]">
              {"{{type_operation}}"}, {"{{produit}}"}, {"{{libelle_stellium}}"}, {"{{date_operation}}"}
            </code>
            . Tu / vous selon le registre de la fiche contact.
          </p>
        </div>
      )}
    </div>
  );
}
