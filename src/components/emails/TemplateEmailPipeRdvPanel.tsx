import { CalendarClock, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";
import {
  buildPipeRdvReminderTemplateNom,
  formatPipeRdvReminderScheduleSummary,
  PIPE_RDV_FORMALITY_HINT,
  type TemplateEmailPipeRdvReminderConfig,
  type TemplateEmailPipeRdvTriggerConfig,
} from "@/lib/emails/template-email-pipe-rdv";
import { PIPE_RDV_STAGE_OPTIONS, type PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { PIPE_STAGE_DESCRIPTIONS } from "@/lib/pipe/pipe-types";

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
};

export function TemplateEmailPipeRdvPanel({
  draft,
  onChange,
  parentNom,
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
              <label key={stage} className="flex items-start gap-2 text-sm max-w-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={draft.trigger.stages.includes(stage)}
                  onCheckedChange={(checked) => toggleStage(stage, checked === true)}
                />
                <span>
                  <span className="font-medium">{stage}</span>
                  <span className="block text-xs text-muted-foreground">
                    {PIPE_STAGE_DESCRIPTIONS[stage]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {draft.trigger.stages.length === 0 && (
            <p className="text-xs text-amber-700">
              Sélectionnez au moins une étape pour activer l&apos;envoi.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Salutation :{" "}
            <code className="text-[11px]">
              Bonjour {"{{prenom}}"}
              {"{{co_contact_et_prenom}}"},
            </code>
            . {PIPE_RDV_FORMALITY_HINT}
          </p>
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
              RDV). Envoyé en arrière-plan tant que le CRM tourne (tray ou fenêtre ouverte).
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

          <p className="text-xs text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
            {PIPE_RDV_FORMALITY_HINT}
          </p>

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
            <div className="space-y-4 border-t pt-4">
              <div>
                <Label className="text-sm font-medium">Message de rappel dédié</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Modèle lié :{" "}
                  <strong>
                    {parentNom.trim()
                      ? buildPipeRdvReminderTemplateNom(parentNom)
                      : "Rappel RDV — (nom du modèle principal)"}
                  </strong>
                </p>
              </div>

              <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
                <Label className="text-sm">Vouvoiement *</Label>
                <Input
                  placeholder="Objet du rappel (vous)"
                  value={draft.reminderSujet}
                  onChange={(e) => patch({ reminderSujet: e.target.value })}
                />
                <RichTextEmailEditor
                  value={draft.reminderCorpsHtml}
                  onChange={(html) => patch({ reminderCorpsHtml: html })}
                  minHeight="140px"
                />
              </div>

              <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <Label className="text-sm">
                  Tutoiement
                  {mainTutoiementEnabled ? " *" : " (optionnel)"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Contacts en tutoiement sur leur fiche recevront cette variante. Couple sur
                  l&apos;affaire → vouvoiement pour les deux, même si la fiche est en tu.
                  {mainTutoiementEnabled
                    ? " Obligatoire car l'onglet Tutoiement du message principal est activé."
                    : ""}
                </p>
                <Input
                  placeholder="Objet du rappel (tu)"
                  value={draft.reminderTuSujet}
                  onChange={(e) => patch({ reminderTuSujet: e.target.value })}
                />
                <RichTextEmailEditor
                  value={draft.reminderTuCorpsHtml}
                  onChange={(html) => patch({ reminderTuCorpsHtml: html })}
                  minHeight="120px"
                />
              </div>
            </div>
          )}

          {draft.reminder.use_same_message && (
            <p className="text-xs text-muted-foreground rounded-md border px-3 py-2 bg-muted/20">
              Même message que la confirmation : le rappel reprend les variantes vouvoiement et
              tutoiement du message principal (onglets Message et Tutoiement).{" "}
              {PIPE_RDV_FORMALITY_HINT}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
