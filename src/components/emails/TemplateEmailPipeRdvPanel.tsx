import { CalendarClock, Mail, MessageSquareReply } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";
import { TemplateEmailAttachmentsPanel } from "@/components/emails/TemplateEmailAttachmentsPanel";
import {
  buildPipeRdvFollowUpTemplateNom,
  buildPipeRdvReminderTemplateNom,
  formatPipeRdvFollowUpScheduleSummary,
  formatPipeRdvReminderScheduleSummary,
  PIPE_RDV_FORMALITY_HINT,
  type TemplateEmailPipeRdvDelayedEmailConfig,
  type TemplateEmailPipeRdvFollowUpConfig,
  type TemplateEmailPipeRdvReminderConfig,
  type TemplateEmailPipeRdvTriggerConfig,
} from "@/lib/emails/template-email-pipe-rdv";
import { PIPE_RDV_STAGE_OPTIONS, type PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { PIPE_STAGE_DESCRIPTIONS } from "@/lib/pipe/pipe-types";
import type { TemplateEmailAttachmentMeta } from "@/lib/emails/template-email-attachments";

export type TemplatePipeRdvDraft = {
  trigger: TemplateEmailPipeRdvTriggerConfig;
  reminder: TemplateEmailPipeRdvReminderConfig;
  followUp: TemplateEmailPipeRdvFollowUpConfig;
  reminderSujet: string;
  reminderCorpsHtml: string;
  reminderTuSujet: string;
  reminderTuCorpsHtml: string;
  followUpSujet: string;
  followUpCorpsHtml: string;
  followUpTuSujet: string;
  followUpTuCorpsHtml: string;
};

type DelayedMessageDraft = {
  sujet: string;
  corpsHtml: string;
  tuSujet: string;
  tuCorpsHtml: string;
};

type DelayedEmailSectionProps = {
  idPrefix: string;
  title: string;
  description: string;
  icon: typeof CalendarClock;
  panelClassName: string;
  iconClassName: string;
  enabled: boolean;
  triggerEnabled: boolean;
  config: TemplateEmailPipeRdvDelayedEmailConfig;
  scheduleSummary: string;
  dedicatedLabel: string;
  linkedTemplateLabel: string;
  sameMessageHint: string;
  mainTutoiementEnabled: boolean;
  messageDraft: DelayedMessageDraft;
  onEnabledChange: (checked: boolean) => void;
  onConfigChange: (partial: Partial<TemplateEmailPipeRdvDelayedEmailConfig>) => void;
  onMessageDraftChange: (partial: Partial<DelayedMessageDraft>) => void;
  linkedTemplateId?: number | null;
  linkedAttachments?: TemplateEmailAttachmentMeta[];
  onLinkedAttachmentsChange?: (attachments: TemplateEmailAttachmentMeta[]) => void;
  linkedTuTemplateId?: number | null;
  linkedTuAttachments?: TemplateEmailAttachmentMeta[];
  onLinkedTuAttachmentsChange?: (attachments: TemplateEmailAttachmentMeta[]) => void;
  attachmentsDisabled?: boolean;
};

function PipeRdvDelayedEmailSection({
  idPrefix,
  title,
  description,
  icon: Icon,
  panelClassName,
  iconClassName,
  enabled,
  triggerEnabled,
  config,
  scheduleSummary,
  dedicatedLabel,
  linkedTemplateLabel,
  sameMessageHint,
  mainTutoiementEnabled,
  messageDraft,
  onEnabledChange,
  onConfigChange,
  onMessageDraftChange,
  linkedTemplateId = null,
  linkedAttachments = [],
  onLinkedAttachmentsChange,
  linkedTuTemplateId = null,
  linkedTuAttachments = [],
  onLinkedTuAttachmentsChange,
  attachmentsDisabled = false,
}: DelayedEmailSectionProps) {
  return (
    <>
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${panelClassName}`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Label htmlFor={`${idPrefix}-enabled`} className="text-sm font-medium">
              {title}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <Switch
          id={`${idPrefix}-enabled`}
          checked={enabled}
          disabled={!triggerEnabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled && triggerEnabled && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-delai-heures`}>Délai (heures)</Label>
              <Input
                id={`${idPrefix}-delai-heures`}
                type="number"
                min={1}
                max={720}
                className="w-28"
                value={config.delai_heures}
                onChange={(e) =>
                  onConfigChange({
                    delai_heures: Math.max(1, Number(e.target.value) || 24),
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-envoi-heure`}>Heure d&apos;envoi (optionnel)</Label>
              <Input
                id={`${idPrefix}-envoi-heure`}
                type="time"
                className="w-36"
                value={config.envoi_heure ?? ""}
                onChange={(e) =>
                  onConfigChange({ envoi_heure: e.target.value.trim() || null })
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
              id={`${idPrefix}-same-message`}
              checked={config.use_same_message}
              onCheckedChange={(checked) =>
                onConfigChange({ use_same_message: checked === true })
              }
            />
            <Label htmlFor={`${idPrefix}-same-message`} className="text-sm font-normal">
              Même message que la confirmation
            </Label>
          </div>

          {!config.use_same_message && (
            <div className="space-y-4 border-t pt-4">
              <div>
                <Label className="text-sm font-medium">{dedicatedLabel}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Modèle lié : <strong>{linkedTemplateLabel}</strong>
                </p>
              </div>

              <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
                <Label className="text-sm">Vouvoiement *</Label>
                <Input
                  placeholder="Objet (vous)"
                  value={messageDraft.sujet}
                  onChange={(e) => onMessageDraftChange({ sujet: e.target.value })}
                />
                <RichTextEmailEditor
                  value={messageDraft.corpsHtml}
                  onChange={(html) => onMessageDraftChange({ corpsHtml: html })}
                  minHeight="140px"
                />
                {onLinkedAttachmentsChange && (
                  <TemplateEmailAttachmentsPanel
                    templateId={linkedTemplateId}
                    attachments={linkedAttachments}
                    onChange={onLinkedAttachmentsChange}
                    disabled={attachmentsDisabled}
                  />
                )}
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
                  placeholder="Objet (tu)"
                  value={messageDraft.tuSujet}
                  onChange={(e) => onMessageDraftChange({ tuSujet: e.target.value })}
                />
                <RichTextEmailEditor
                  value={messageDraft.tuCorpsHtml}
                  onChange={(html) => onMessageDraftChange({ tuCorpsHtml: html })}
                  minHeight="120px"
                />
                {onLinkedTuAttachmentsChange && (
                  <TemplateEmailAttachmentsPanel
                    templateId={linkedTuTemplateId}
                    attachments={linkedTuAttachments}
                    onChange={onLinkedTuAttachmentsChange}
                    disabled={attachmentsDisabled}
                  />
                )}
              </div>
            </div>
          )}

          {config.use_same_message && (
            <p className="text-xs text-muted-foreground rounded-md border px-3 py-2 bg-muted/20">
              {sameMessageHint} {PIPE_RDV_FORMALITY_HINT}
            </p>
          )}
        </div>
      )}
    </>
  );
}

type Props = {
  draft: TemplatePipeRdvDraft;
  onChange: (next: TemplatePipeRdvDraft) => void;
  parentNom: string;
  mainTutoiementEnabled?: boolean;
  reminderTemplateId?: number | null;
  reminderAttachments?: TemplateEmailAttachmentMeta[];
  onReminderAttachmentsChange?: (attachments: TemplateEmailAttachmentMeta[]) => void;
  reminderTuTemplateId?: number | null;
  reminderTuAttachments?: TemplateEmailAttachmentMeta[];
  onReminderTuAttachmentsChange?: (attachments: TemplateEmailAttachmentMeta[]) => void;
  followUpTemplateId?: number | null;
  followUpAttachments?: TemplateEmailAttachmentMeta[];
  onFollowUpAttachmentsChange?: (attachments: TemplateEmailAttachmentMeta[]) => void;
  followUpTuTemplateId?: number | null;
  followUpTuAttachments?: TemplateEmailAttachmentMeta[];
  onFollowUpTuAttachmentsChange?: (attachments: TemplateEmailAttachmentMeta[]) => void;
  attachmentsDisabled?: boolean;
};

export function TemplateEmailPipeRdvPanel({
  draft,
  onChange,
  parentNom,
  mainTutoiementEnabled = false,
  reminderTemplateId = null,
  reminderAttachments = [],
  onReminderAttachmentsChange,
  reminderTuTemplateId = null,
  reminderTuAttachments = [],
  onReminderTuAttachmentsChange,
  followUpTemplateId = null,
  followUpAttachments = [],
  onFollowUpAttachmentsChange,
  followUpTuTemplateId = null,
  followUpTuAttachments = [],
  onFollowUpTuAttachmentsChange,
  attachmentsDisabled = false,
}: Props) {
  const patch = (partial: Partial<TemplatePipeRdvDraft>) =>
    onChange({ ...draft, ...partial });

  const patchTrigger = (partial: Partial<TemplateEmailPipeRdvTriggerConfig>) =>
    patch({ trigger: { ...draft.trigger, ...partial } });

  const patchReminder = (partial: Partial<TemplatePipeRdvDraft["reminder"]>) =>
    patch({ reminder: { ...draft.reminder, ...partial } });

  const patchFollowUp = (partial: Partial<TemplateEmailPipeRdvFollowUpConfig>) =>
    patch({ followUp: { ...draft.followUp, ...partial } });

  const toggleStage = (stage: PipeRdvStage, checked: boolean) => {
    const stages = checked
      ? [...new Set([...draft.trigger.stages, stage])]
      : draft.trigger.stages.filter((s) => s !== stage);
    patchTrigger({ stages });
  };

  const reminderSummary = formatPipeRdvReminderScheduleSummary(draft.reminder);
  const followUpSummary = formatPipeRdvFollowUpScheduleSummary(draft.followUp);
  const parentNomTrimmed = parentNom.trim();

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

      <PipeRdvDelayedEmailSection
        idPrefix="pipe-rdv-reminder"
        title="Rappel avant le RDV"
        description="Email automatique planifié avant l'heure du RDV (replanifié si vous décalez le RDV). Envoyé en arrière-plan tant que le CRM tourne (tray ou fenêtre ouverte)."
        icon={CalendarClock}
        panelClassName="bg-sky-50/80"
        iconClassName="bg-sky-100 text-sky-900"
        enabled={draft.reminder.enabled}
        triggerEnabled={draft.trigger.enabled}
        config={draft.reminder}
        scheduleSummary={reminderSummary}
        dedicatedLabel="Message de rappel dédié"
        linkedTemplateLabel={
          parentNomTrimmed
            ? buildPipeRdvReminderTemplateNom(parentNom)
            : "Rappel RDV — (nom du modèle principal)"
        }
        sameMessageHint="Même message que la confirmation : le rappel reprend les variantes vouvoiement et tutoiement du message principal (onglets Message et Tutoiement)."
        mainTutoiementEnabled={mainTutoiementEnabled}
        messageDraft={{
          sujet: draft.reminderSujet,
          corpsHtml: draft.reminderCorpsHtml,
          tuSujet: draft.reminderTuSujet,
          tuCorpsHtml: draft.reminderTuCorpsHtml,
        }}
        onEnabledChange={(checked) => patchReminder({ enabled: checked })}
        onConfigChange={(partial) => patchReminder(partial)}
        onMessageDraftChange={(partial) =>
          patch({
            ...(partial.sujet !== undefined ? { reminderSujet: partial.sujet } : {}),
            ...(partial.corpsHtml !== undefined ? { reminderCorpsHtml: partial.corpsHtml } : {}),
            ...(partial.tuSujet !== undefined ? { reminderTuSujet: partial.tuSujet } : {}),
            ...(partial.tuCorpsHtml !== undefined
              ? { reminderTuCorpsHtml: partial.tuCorpsHtml }
              : {}),
          })
        }
        linkedTemplateId={reminderTemplateId}
        linkedAttachments={reminderAttachments}
        onLinkedAttachmentsChange={onReminderAttachmentsChange}
        linkedTuTemplateId={reminderTuTemplateId}
        linkedTuAttachments={reminderTuAttachments}
        onLinkedTuAttachmentsChange={onReminderTuAttachmentsChange}
        attachmentsDisabled={attachmentsDisabled}
      />

      <PipeRdvDelayedEmailSection
        idPrefix="pipe-rdv-follow-up"
        title="Email après le RDV"
        description="Email automatique planifié après la fin du RDV (replanifié si vous décalez le RDV). Envoyé en arrière-plan tant que le CRM tourne (tray ou fenêtre ouverte)."
        icon={MessageSquareReply}
        panelClassName="bg-amber-50/80"
        iconClassName="bg-amber-100 text-amber-900"
        enabled={draft.followUp.enabled}
        triggerEnabled={draft.trigger.enabled}
        config={draft.followUp}
        scheduleSummary={followUpSummary}
        dedicatedLabel="Message de suivi dédié"
        linkedTemplateLabel={
          parentNomTrimmed
            ? buildPipeRdvFollowUpTemplateNom(parentNom)
            : "Suivi RDV — (nom du modèle principal)"
        }
        sameMessageHint="Même message que la confirmation : le suivi reprend les variantes vouvoiement et tutoiement du message principal (onglets Message et Tutoiement)."
        mainTutoiementEnabled={mainTutoiementEnabled}
        messageDraft={{
          sujet: draft.followUpSujet,
          corpsHtml: draft.followUpCorpsHtml,
          tuSujet: draft.followUpTuSujet,
          tuCorpsHtml: draft.followUpTuCorpsHtml,
        }}
        onEnabledChange={(checked) => patchFollowUp({ enabled: checked })}
        onConfigChange={(partial) => patchFollowUp(partial)}
        onMessageDraftChange={(partial) =>
          patch({
            ...(partial.sujet !== undefined ? { followUpSujet: partial.sujet } : {}),
            ...(partial.corpsHtml !== undefined ? { followUpCorpsHtml: partial.corpsHtml } : {}),
            ...(partial.tuSujet !== undefined ? { followUpTuSujet: partial.tuSujet } : {}),
            ...(partial.tuCorpsHtml !== undefined
              ? { followUpTuCorpsHtml: partial.tuCorpsHtml }
              : {}),
          })
        }
        linkedTemplateId={followUpTemplateId}
        linkedAttachments={followUpAttachments}
        onLinkedAttachmentsChange={onFollowUpAttachmentsChange}
        linkedTuTemplateId={followUpTuTemplateId}
        linkedTuAttachments={followUpTuAttachments}
        onLinkedTuAttachmentsChange={onFollowUpTuAttachmentsChange}
        attachmentsDisabled={attachmentsDisabled}
      />
    </div>
  );
}
