import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AutoRuleConditionFields } from "@/components/etiquettes/AutoRuleConditionFields";
import {
  stringifyConditionConfig,
  type ConditionEvenementSouscription,
} from "@/lib/api/tauri-etiquettes";
import type { TemplateEmailTriggerConfig } from "@/lib/emails/template-email-trigger";
import { DEFAULT_TEMPLATE_EMAIL_TRIGGER } from "@/lib/emails/template-email-trigger";
import { Zap } from "lucide-react";

type Props = {
  trigger: TemplateEmailTriggerConfig;
  onChange: (next: TemplateEmailTriggerConfig) => void;
};

export function TemplateEmailTriggerPanel({ trigger, onChange }: Props) {
  const patch = (partial: Partial<TemplateEmailTriggerConfig>) =>
    onChange({ ...trigger, ...partial });

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
              onChange({ ...DEFAULT_TEMPLATE_EMAIL_TRIGGER });
              return;
            }
            onChange({
              ...trigger,
              enabled: true,
              condition_type: "EVENEMENT_SOUSCRIPTION",
              condition_config: stringifyConditionConfig({
                types: [],
                a_chaque_souscription: true,
              }),
              categories: trigger.categories.length > 0 ? trigger.categories : ["CLIENT"],
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
            <p className="text-xs text-muted-foreground">
              Ex. délai <strong>1</strong> + heure <strong>09:00</strong> = lendemain à 9 h dans
              Suivi → Envois (envoi validé par vous).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
