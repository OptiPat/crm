import { CalendarClock, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";
import {
  formatPipeRdvReminderScheduleSummary,
  type TemplateEmailPipeRdvReminderConfig,
  type TemplateEmailPipeRdvTriggerConfig,
} from "@/lib/emails/template-email-pipe-rdv";
import { PIPE_RDV_STAGE_OPTIONS, type PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
import type { TemplateTutoiementDraft } from "@/components/emails/TemplateEmailTutoiementPanel";

export type TemplatePipeRdvDraft = {
  trigger: TemplateEmailPipeRdvTriggerConfig;
  reminder: TemplateEmailPipeRdvReminderConfig;
  reminderSujet: string;
  reminderCorpsHtml: string;
  reminderTuSujet: string;
  reminderTuCorpsHtml: string;
};

type Props = {
  draft: TemplatePipeRdvDraft;
  onChange: (next: TemplatePipeRdvDraft) => void;
  parentNom: string;
  mainTutoiementEnabled?: boolean;
  tutoiementDraft?: TemplateTutoiementDraft;
};

export function TemplateEmailPipeRdvPanel({
  draft,
  onChange,
  mainTutoiementEnabled = false,
}: Props) {
  const patch = (partial: Partial<TemplatePipeRdvDraft>) =>
    onChange({ ...draft, ...partial });

  const patchTrigger = (partial: Partial<TemplateEmailPipeRdvTriggerConfig>) =>
    patch({ trigger: { ...draft.trigger, ...partial } });

  const patchReminder = (partial: Partial<TemplateEmailPipeRdvReminderConfig>) =>
    patch({ reminder: { ...draft.reminder, ...partial } });

  const toggleStage = (stage: PipeRdvStage, checked: boolean) => {
    const stages = checked
      ? [...new Set([...draft.trigger.stages, stage])]
      : draft.trigger.stages.filter((s) => s !== stage);
    patchTrigger({ stages });
  };

  const scheduleSummary = formatPipeRdvReminderScheduleSummary(draft.reminder);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-emerald-50/80 px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900">
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Label htmlFor="pipe-rdv-trigger" className="text-sm font-medium">
              Email RDV Pipe (planification / replanification)
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Envoyé depuis le CRM quand vous planifiez un RDV sur une affaire Pipe. Choisissez
              les étapes concernées (R1, R2, R3).
            </p>
          </div>
        </div>
        <Switch
          id="pipe-rdv-trigger"
          checked={draft.trigger.enabled}
          onCheckedChange={(checked) => patchTrigger({ enabled: checked })}
        />
      </div>

      {draft.trigger.enabled && (
        <div className="space-y-3 rounded-lg border p-4">
          <Label className="text-sm font-medium">Étapes Pipe déclenchant ce modèle</Label>
          <div className="flex flex-wrap gap-4">
            {PIPE_RDV_STAGE_OPTIONS.map((stage) => (
              <label key={stage} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.trigger.stages.includes(stage)}
                  onCheckedChange={(checked) => toggleStage(stage, checked === true)}
                />
                {PIPE_STAGE_LABELS[stage]} ({stage})
              </label>
            ))}
          </div>
          {draft.trigger.stages.length === 0 && (
            <p className="text-xs text-amber-700">
              Sélectionnez au moins une étape pour activer l&apos;envoi.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border bg-sky-50/80 px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-900">
            <CalendarClock className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Label htmlFor="pipe-rdv-reminder" className="text-sm font-medium">
              Rappel avant le RDV
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Email automatique planifié avant l&apos;heure du RDV (replanifié si vous décalez le
              RDV). L&apos;app doit rester ouverte ou reprendre focus pour l&apos;envoi.
            </p>
          </div>
        </div>
        <Switch
          id="pipe-rdv-reminder"
          checked={draft.reminder.enabled}
          disabled={!draft.trigger.enabled}
          onCheckedChange={(checked) => patchReminder({ enabled: checked })}
        />
      </div>

      {draft.reminder.enabled && draft.trigger.enabled && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label htmlFor="pipe-rdv-delai-heures">Délai avant le RDV (heures)</Label>
              <Input
                id="pipe-rdv-delai-heures"
                type="number"
                min={1}
                max={720}
                className="w-28"
                value={draft.reminder.delai_heures}
                onChange={(e) =>
                  patchReminder({
                    delai_heures: Math.max(1, Number(e.target.value) || 24),
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pipe-rdv-envoi-heure">Heure d&apos;envoi (optionnel)</Label>
              <Input
                id="pipe-rdv-envoi-heure"
                type="time"
                className="w-36"
                value={draft.reminder.envoi_heure ?? ""}
                onChange={(e) =>
                  patchReminder({ envoi_heure: e.target.value.trim() || null })
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{scheduleSummary}</p>

          <div className="flex items-center gap-2">
            <Checkbox
              id="pipe-rdv-same-message"
              checked={draft.reminder.use_same_message}
              onCheckedChange={(checked) =>
                patchReminder({ use_same_message: checked === true })
              }
            />
            <Label htmlFor="pipe-rdv-same-message" className="text-sm font-normal">
              Même message que la confirmation
            </Label>
          </div>

          {!draft.reminder.use_same_message && (
            <div className="space-y-3 border-t pt-4">
              <Label className="text-sm font-medium">Message de rappel dédié</Label>
              <Input
                placeholder="Objet du rappel"
                value={draft.reminderSujet}
                onChange={(e) => patch({ reminderSujet: e.target.value })}
              />
              <RichTextEmailEditor
                value={draft.reminderCorpsHtml}
                onChange={(html) => patch({ reminderCorpsHtml: html })}
                minHeight="160px"
              />
              {mainTutoiementEnabled && (
                <div className="space-y-2 pt-2">
                  <Label className="text-sm">Variante tutoiement (rappel)</Label>
                  <Input
                    placeholder="Objet tutoiement"
                    value={draft.reminderTuSujet}
                    onChange={(e) => patch({ reminderTuSujet: e.target.value })}
                  />
                  <RichTextEmailEditor
                    value={draft.reminderTuCorpsHtml}
                    onChange={(html) => patch({ reminderTuCorpsHtml: html })}
                    minHeight="120px"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
