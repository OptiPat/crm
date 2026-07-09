import { EmailEnvoiWeekdayPicker } from "@/components/emails/EmailEnvoiWeekdayPicker";
import { parseEmailEnvoiJoursSemaine } from "@/lib/emails/email-envoi-schedule";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AutoRuleConditionFields } from "@/components/etiquettes/AutoRuleConditionFields";
import { ConditionBuilder } from "@/components/etiquettes/ConditionBuilder";
import {
  stringifyConditionConfig,
  type ConditionEvenementSouscription,
} from "@/lib/api/tauri-etiquettes";
import {
  type TemplateEmailTriggerConfig,
} from "@/lib/emails/template-email-trigger";
import { EtiquetteRuleSummaryCard } from "@/components/etiquettes/etiquette-form-ui";
import { formatTemplateEmailTriggerSummary } from "@/lib/emails/template-email-trigger-summary";
import { SegmentRulePreview } from "@/components/etiquettes/SegmentRulePreview";
import { buildTemplateEmailTriggerPreviewJson } from "@/lib/emails/template-email-trigger-preview";
import {
  defaultTriggerRuleChildren,
  isTriggerRuleTree,
  parseTriggerRuleTree,
  triggerRuleTreeToConfig,
} from "@/lib/emails/template-email-trigger-rule-tree";
import type { RuleLeaf, RuleOp } from "@/lib/etiquettes/rule-ast";
import { Zap } from "lucide-react";
import { useMemo, useRef } from "react";

type SimpleTriggerSnapshot = Pick<
  TemplateEmailTriggerConfig,
  "condition_type" | "condition_config" | "categories"
>;

type Props = {
  trigger: TemplateEmailTriggerConfig;
  onChange: (next: TemplateEmailTriggerConfig) => void;
};

export function TemplateEmailTriggerPanel({ trigger, onChange }: Props) {
  const patch = (partial: Partial<TemplateEmailTriggerConfig>) =>
    onChange({ ...trigger, ...partial });

  const simpleTriggerBeforeComboRef = useRef<SimpleTriggerSnapshot | null>(null);

  const useComboRule = isTriggerRuleTree(trigger.condition_type);
  const parsedTree = useMemo(
    () => parseTriggerRuleTree(trigger.condition_config),
    [trigger.condition_config]
  );
  const ruleOp: RuleOp = parsedTree?.op ?? "and";
  const ruleChildren: RuleLeaf[] = parsedTree?.children ?? defaultTriggerRuleChildren();

  const triggerSummary = useMemo(
    () => formatTemplateEmailTriggerSummary(trigger),
    [trigger]
  );

  const triggerPreviewJson = useMemo(
    () => buildTemplateEmailTriggerPreviewJson(trigger),
    [trigger]
  );

  const conditionType = trigger.condition_type ?? "EVENEMENT_SOUSCRIPTION";

  const setRepeatEach = (each: boolean) => {
    patch({ a_chaque_souscription: each });
    if (conditionType !== "EVENEMENT_SOUSCRIPTION" || !trigger.condition_config) return;
    try {
      const parsed = JSON.parse(trigger.condition_config) as ConditionEvenementSouscription;
      patch({
        a_chaque_souscription: each,
        condition_config: stringifyConditionConfig({
          ...parsed,
          a_chaque_souscription: each,
        }),
      });
    } catch {
      patch({
        a_chaque_souscription: each,
        condition_config: stringifyConditionConfig({
          types: [],
          a_chaque_souscription: each,
        }),
      });
    }
  };

  const enableComboRule = (enabled: boolean) => {
    if (!enabled) {
      const restored = simpleTriggerBeforeComboRef.current;
      simpleTriggerBeforeComboRef.current = null;
      onChange({
        ...trigger,
        condition_type: restored?.condition_type ?? "DELAI_SANS_CONTACT",
        condition_config:
          restored?.condition_config ??
          stringifyConditionConfig({ jours: 365, inclure_sans_date: true }),
        categories:
          restored?.categories && restored.categories.length > 0
            ? restored.categories
            : trigger.categories.length > 0
              ? trigger.categories
              : ["CLIENT"],
      });
      return;
    }
    if (!isTriggerRuleTree(trigger.condition_type)) {
      simpleTriggerBeforeComboRef.current = {
        condition_type: trigger.condition_type,
        condition_config: trigger.condition_config,
        categories: trigger.categories,
      };
    }
    const next = triggerRuleTreeToConfig("and", defaultTriggerRuleChildren());
    onChange({
      ...trigger,
      condition_type: next.condition_type,
      condition_config: next.condition_config,
      categories: next.categories,
    });
  };

  const updateRuleTree = (op: RuleOp, children: RuleLeaf[]) => {
    const next = triggerRuleTreeToConfig(op, children);
    patch({
      condition_type: next.condition_type,
      condition_config: next.condition_config,
      categories: next.categories,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Zap className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Label htmlFor="trigger-enabled" className="text-sm font-medium">
              Déclencheur automatique (sans étiquette)
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Mêmes types de règles qu&apos;une étiquette auto. Le modèle apparaît dans Suivi →
              Envois quand la condition est remplie.
            </p>
          </div>
        </div>
        <Switch
          id="trigger-enabled"
          checked={trigger.enabled}
          onCheckedChange={(checked) => {
            if (!checked) {
              onChange({ ...trigger, enabled: false });
              return;
            }
            onChange({
              ...trigger,
              enabled: true,
              condition_type: trigger.condition_type ?? "EVENEMENT_SOUSCRIPTION",
              condition_config:
                trigger.condition_config ??
                stringifyConditionConfig({
                  types: [],
                  a_chaque_souscription: trigger.a_chaque_souscription,
                }),
              categories:
                trigger.categories.length > 0 ? trigger.categories : ["CLIENT"],
            });
          }}
        />
      </div>

      {!trigger.enabled && (
        <p className="text-sm text-center text-muted-foreground py-6 border border-dashed rounded-lg">
          Désactivé — utilisez les étiquettes liées (onglet Liaisons) ou un envoi manuel.
        </p>
      )}

      {trigger.enabled && (
        <div className="space-y-5 rounded-lg border p-4">
          {triggerSummary ? <EtiquetteRuleSummaryCard summary={triggerSummary} /> : null}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Règle combinée (ET / OU)</p>
              <p className="text-xs text-muted-foreground">
                Ex. TMI 30 % et revenus ≥ 60 000 € — plusieurs critères en une fois.
              </p>
            </div>
            <Switch
              id="trigger-combo-rule"
              checked={useComboRule}
              onCheckedChange={enableComboRule}
            />
          </div>

          {useComboRule ? (
            <ConditionBuilder
              op={ruleOp}
              onOpChange={(op) => updateRuleTree(op, ruleChildren)}
              children={ruleChildren}
              onChange={(children) => updateRuleTree(ruleOp, children)}
              showPreview
              previewSelectable
              excludedContactIds={trigger.excluded_contact_ids}
              onExcludedContactIdsChange={(excluded_contact_ids) =>
                patch({ excluded_contact_ids })
              }
            />
          ) : (
            <>
              <AutoRuleConditionFields
                conditionType={conditionType}
                conditionConfig={trigger.condition_config}
                categories={trigger.categories}
                onChange={({ conditionType: ct, conditionConfig, categories }) =>
                  patch({
                    condition_type: ct,
                    condition_config: conditionConfig,
                    categories,
                  })
                }
                repeatEachSouscription={trigger.a_chaque_souscription}
                onRepeatEachSouscriptionChange={setRepeatEach}
              />
              {triggerPreviewJson ? (
                <SegmentRulePreview
                  ruleJson={triggerPreviewJson}
                  listTitle="Contacts du déclencheur"
                  selectable
                  excludedContactIds={trigger.excluded_contact_ids}
                  onExcludedContactIdsChange={(excluded_contact_ids) =>
                    patch({ excluded_contact_ids })
                  }
                />
              ) : conditionType === "EVENEMENT_SOUSCRIPTION" ? (
                <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 px-3 py-2">
                  L&apos;aperçu compteur ne s&apos;applique pas aux souscriptions : le contact
                  apparaît dans Suivi → Envois à chaque nouvel investissement éligible.
                </p>
              ) : null}
            </>
          )}

          <div className="space-y-2 border-t pt-4">
            <Label className="text-sm font-medium">Quand proposer l&apos;envoi ?</Label>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label htmlFor="trg-delai" className="text-xs text-muted-foreground">
                  Délai (jours après le déclenchement)
                </Label>
                <Input
                  id="trg-delai"
                  type="number"
                  min={0}
                  max={365}
                  className="w-24"
                  value={trigger.delai_jours}
                  onChange={(e) =>
                    patch({ delai_jours: Math.max(0, parseInt(e.target.value, 10) || 0) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="trg-heure" className="text-xs text-muted-foreground">
                  Heure
                </Label>
                <Input
                  id="trg-heure"
                  type="time"
                  className="w-[160px]"
                  value={trigger.envoi_heure}
                  onChange={(e) => patch({ envoi_heure: e.target.value })}
                />
              </div>
            </div>
            <EmailEnvoiWeekdayPicker
              id="trg-jours-semaine"
              value={parseEmailEnvoiJoursSemaine(trigger.envoi_jours_semaine)}
              onChange={(days) =>
                patch({
                  envoi_jours_semaine:
                    days && days.length > 0 ? JSON.stringify(days) : null,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Ex. délai <strong>45</strong> + <strong>19:00</strong> + <strong>Mer</strong> = 45
              jours après la souscription, puis le prochain mercredi à 19 h (Suivi → Envois).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
