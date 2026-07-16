import { CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  type TemplateEmailPlacementConformeTriggerConfig,
} from "@/lib/emails/template-email-placement-conforme";
import {
  formatPlacementTemplateScopedLabel,
  parsePlacementTemplateScopedLabel,
  resolveLegacyUnscopedTemplateLabelGroupId,
  stelliumBoxPlacementLabelsMatch,
  stelliumBoxPlacementTemplateLabelGroups,
} from "@/lib/placement/stellium-box-placement-labels";

export type TemplatePlacementConformeDraft = {
  trigger: TemplateEmailPlacementConformeTriggerConfig;
};

type Props = {
  draft: TemplatePlacementConformeDraft;
  onChange: (next: TemplatePlacementConformeDraft) => void;
};

const LABEL_GROUPS = stelliumBoxPlacementTemplateLabelGroups();

function isLabelChecked(labels: string[], groupId: string, label: string): boolean {
  const scoped = formatPlacementTemplateScopedLabel(groupId, label);
  if (labels.includes(scoped)) return true;
  return labels.some((item) => {
    const parsed = parsePlacementTemplateScopedLabel(item);
    if (parsed.groupId !== null) return false;
    if (!stelliumBoxPlacementLabelsMatch(parsed.label, label)) return false;
    return resolveLegacyUnscopedTemplateLabelGroupId(parsed.label) === groupId;
  });
}

function removeScopedLabel(labels: string[], groupId: string, label: string): string[] {
  const scoped = formatPlacementTemplateScopedLabel(groupId, label);
  return labels.filter((item) => {
    if (item === scoped) return false;
    const parsed = parsePlacementTemplateScopedLabel(item);
    if (parsed.groupId !== null) return true;
    if (!stelliumBoxPlacementLabelsMatch(parsed.label, label)) return true;
    return resolveLegacyUnscopedTemplateLabelGroupId(parsed.label) !== groupId;
  });
}

export function TemplateEmailPlacementConformePanel({ draft, onChange }: Props) {
  const patchTrigger = (partial: Partial<TemplateEmailPlacementConformeTriggerConfig>) =>
    onChange({ trigger: { ...draft.trigger, ...partial } });

  const toggleStelliumLabel = (groupId: string, label: string, checked: boolean) => {
    const scoped = formatPlacementTemplateScopedLabel(groupId, label);
    const stellium_labels = checked
      ? [...removeScopedLabel(draft.trigger.stellium_labels, groupId, label), scoped]
      : removeScopedLabel(draft.trigger.stellium_labels, groupId, label);
    patchTrigger({ stellium_labels });
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
        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <Label className="text-sm font-medium">Types d&apos;opération couverts</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Mêmes libellés que lors de la déclaration d&apos;un acte sur un suivi ou une affaire.
            </p>
          </div>
          <div className="space-y-4">
            {LABEL_GROUPS.map((group) => (
              <section key={group.id} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{group.label}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((label) => (
                    <label
                      key={`${group.id}::${label}`}
                      className="flex items-start gap-2 rounded-md border border-transparent px-1 py-0.5 text-sm hover:border-border/60"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={isLabelChecked(draft.trigger.stellium_labels, group.id, label)}
                        onCheckedChange={(checked) =>
                          toggleStelliumLabel(group.id, label, checked === true)
                        }
                      />
                      <span className="leading-snug">{label}</span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {draft.trigger.stellium_labels.length === 0 && (
            <p className="text-xs text-amber-700">
              Sélectionnez au moins un acte pour activer l&apos;envoi.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Variables dédiées :{" "}
            <code className="text-[11px]">
              {"{{libelle_client}}"}, {"{{produit}}"}, {"{{libelle_stellium}}"}, {"{{date_operation}}"}
            </code>
            . Tu / vous selon le registre de la fiche contact.
          </p>
        </div>
      )}
    </div>
  );
}
