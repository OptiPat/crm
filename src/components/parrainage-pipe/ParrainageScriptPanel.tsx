import { useEffect, useRef, useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { SmsBrandIcon, WhatsAppBrandIcon } from "@/components/icons/MessagingBrandIcons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParrainagePipeRecord } from "@/lib/api/tauri-parrainage-pipe";
import {
  createParrainagePipeSmsSentNote,
  createParrainagePipeTimelineNote,
} from "@/lib/api/tauri-parrainage-pipe";
import { createTache } from "@/lib/api/tauri-taches";
import { getFilleulDossier, upsertFilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { openExternalUrl } from "@/lib/api/tauri-system";
import {
  buildSmsUrl,
  buildWhatsAppUrl,
  hasMessagingPhone,
} from "@/lib/contacts/birthday-outreach";
import {
  APPEL_PRISE_CONTACT_OBJECTIONS,
  APPEL_PRISE_CONTACT_STEPS,
  renderAppelPriseContactStep,
  type AppelPriseContactStepDef,
} from "@/lib/parrainage-coach/appel-prise-contact-script";
import {
  availableSmsAnticipationVariants,
  formatSmsAnticipationSentNote,
  renderSmsAnticipationTemplate,
  SMS_ANTICIPATION_INSISTE_SMS_DEF,
  SMS_ANTICIPATION_COACH_PROFILES,
  SMS_ANTICIPATION_PROFILE_DEFS,
  SMS_ANTICIPATION_REPLY_DEFS,
  SMS_ANTICIPATION_REPLY_OPTIONS,
  SMS_ANTICIPATION_REPLY_SCENARIOS,
  smsAnticipationProfileWaitingReplies,
  smsAnticipationProfileInitialReplies,
  smsAnticipationProfileReplyShowsInsisteSms,
  type SmsAnticipationInitialReplyOption,
  type SmsAnticipationProfile,
  type SmsAnticipationReplyOption,
  type SmsAnticipationReplyScenario,
  type SmsAnticipationVariant,
} from "@/lib/parrainage-coach/sms-anticipation-templates";
import {
  formatParrainageContactLabel,
  PARRAINAGE_INVITATION_LABELS,
  PARRAINAGE_INVITATION_TYPES,
  PARRAINAGE_PIPE_STAGE_LABELS,
  type ParrainageInvitationType,
  type ParrainagePipeStage,
} from "@/lib/parrainage-pipe/parrainage-pipe-types";
import {
  parrainageInvitationDateRequiredMessage,
  parrainageInvitationRequiredMessage,
  formatParrainagePipeError,
} from "@/lib/parrainage-pipe/parrainage-pipe-errors";
import {
  defaultParrainageCallSchedule,
  formatParrainageCallScheduleLabel,
  formatParrainageInvitationDateLabel,
  formatParrainageInvitationSummary,
  formatParrainagePresenceConfirmationTaskTitle,
  formatParrainageScriptInvitationDate,
  localDateTimeInputToUnix,
  parrainagePresenceConfirmationDueUnix,
} from "@/lib/parrainage-pipe/parrainage-call-schedule";
import {
  recordParrainageJdAbandon,
  recordParrainageJdAbsentNoDate,
  recordParrainageJdAbsentReschedule,
  recordParrainageJdPresent,
  replanifyParrainageWithNewDate,
} from "@/lib/parrainage-pipe/parrainage-jd-outcome";
import { fireConfettiBurst } from "@/lib/ui/confetti-burst";
import {
  buildUpsertFilleulDossierInput,
  emptyFilleulDossier,
} from "@/lib/organisation/organisation-filleul-dossier";
import { toast } from "sonner";

const APPEL_PRISE_CONTACT_ALL_STEPS = [
  ...APPEL_PRISE_CONTACT_STEPS,
  ...APPEL_PRISE_CONTACT_OBJECTIONS,
];

function buildAppelPriseContactFollowUpTexts(steps: AppelPriseContactStepDef[]): Record<string, string> {
  return Object.fromEntries(
    steps.filter((step) => step.followUp).map((step) => [step.id, step.followUp!.template])
  );
}

function CoachScriptReplyFields({
  primaryText,
  onPrimaryChange,
  followUp,
  followUpText,
  onFollowUpChange,
  onCopy,
  autoResize,
  primaryLabel = "Réponse à envoyer",
  primaryRows = 3,
  hidePrimary = false,
}: {
  primaryText: string;
  onPrimaryChange: (text: string) => void;
  followUp?: AppelPriseContactStepDef["followUp"];
  followUpText?: string;
  onFollowUpChange?: (text: string) => void;
  onCopy: (text: string) => Promise<void>;
  autoResize?: (el: HTMLTextAreaElement | null) => void;
  primaryLabel?: string;
  primaryRows?: number;
  hidePrimary?: boolean;
}) {
  const textareaClass = autoResize
    ? "text-sm resize-none overflow-hidden"
    : "text-sm";

  return (
    <>
      {!hidePrimary && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">{primaryLabel}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => void onCopy(primaryText)}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <Textarea
            ref={autoResize}
            value={primaryText}
            onChange={(e) => {
              onPrimaryChange(e.target.value);
              autoResize?.(e.target);
            }}
            rows={primaryRows}
            className={textareaClass}
          />
        </div>
      )}
      {followUp && onFollowUpChange && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">{followUp.label}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => void onCopy(followUpText ?? "")}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <Textarea
            ref={autoResize}
            value={followUpText ?? ""}
            onChange={(e) => {
              onFollowUpChange(e.target.value);
              autoResize?.(e.target);
            }}
            rows={3}
            className={textareaClass}
          />
        </div>
      )}
    </>
  );
}

function AppelPriseContactObjectionsPicker({
  texts,
  followUpTexts,
  onTextChange,
  onFollowUpTextChange,
  onCopy,
  autoResize,
}: {
  texts: Record<string, string>;
  followUpTexts: Record<string, string>;
  onTextChange: (stepId: string, text: string) => void;
  onFollowUpTextChange: (stepId: string, text: string) => void;
  onCopy: (text: string) => Promise<void>;
  autoResize: (el: HTMLTextAreaElement | null) => void;
}) {
  const [selectedId, setSelectedId] = useState(APPEL_PRISE_CONTACT_OBJECTIONS[0]?.id ?? "");
  const selected = APPEL_PRISE_CONTACT_OBJECTIONS.find((objection) => objection.id === selectedId);

  return (
    <div
      className="space-y-3 rounded-md border border-dashed border-amber-300/80 bg-amber-50/60 p-3 dark:border-amber-500/45 dark:bg-amber-950/25"
    >
      <div className="text-xs font-medium text-amber-900 dark:text-amber-100">
        Objections possibles
      </div>
      <div className="flex flex-wrap gap-1.5">
        {APPEL_PRISE_CONTACT_OBJECTIONS.map((objection) => (
          <Button
            key={objection.id}
            type="button"
            size="sm"
            variant={selectedId === objection.id ? "default" : "outline"}
            className="h-7 text-[11px]"
            onClick={() => setSelectedId(objection.id)}
          >
            {objection.pickerLabel ?? objection.title}
          </Button>
        ))}
      </div>
      {selected && (
        <p className="text-[11px] text-amber-800/80 dark:text-amber-200/80">
          S&apos;il dit : {selected.title}
        </p>
      )}
      {selected?.note && (
        <p className="text-[11px] text-amber-800/80 dark:text-amber-200/80">{selected.note}</p>
      )}
      {selected && (
        <CoachScriptReplyFields
          primaryText={texts[selected.id]}
          onPrimaryChange={(text) => onTextChange(selected.id, text)}
          followUp={selected.followUp}
          followUpText={followUpTexts[selected.id]}
          onFollowUpChange={(text) => onFollowUpTextChange(selected.id, text)}
          onCopy={onCopy}
          autoResize={autoResize}
          primaryRows={2}
          hidePrimary={selected.skipPrimary}
        />
      )}
    </div>
  );
}

function profileReplyShowsInsisteSmsPicker(
  profile: SmsAnticipationProfile | null | undefined,
  replyId: string,
  hasProfileReplies: boolean
): boolean {
  if (!hasProfileReplies) return true;
  return smsAnticipationProfileReplyShowsInsisteSms(profile, replyId);
}

const MESSAGING_PHONE_DISABLED_TITLE =
  "Numéro absent ou incompatible (fixe FR, format invalide)";

function CoachMessagingChannelButtons({
  telephone,
  message,
}: {
  telephone?: string | null;
  message: string;
}) {
  const canMessage = hasMessagingPhone(telephone);

  const openChannel = async (channel: "sms" | "whatsapp") => {
    if (!hasMessagingPhone(telephone)) {
      toast.error("Aucun numéro compatible SMS/WhatsApp sur cette fiche.");
      return;
    }
    const url =
      channel === "sms"
        ? buildSmsUrl(telephone!, message)
        : buildWhatsAppUrl(telephone!, message);
    if (!url) {
      toast.error("Numéro incompatible avec SMS/WhatsApp.");
      return;
    }
    try {
      await openExternalUrl(url);
    } catch (error) {
      toast.error(
        channel === "sms"
          ? `Impossible d'ouvrir le SMS : ${String(error)}`
          : `Impossible d'ouvrir WhatsApp : ${String(error)}`
      );
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 px-0"
        disabled={!canMessage}
        title={canMessage ? "Préparer un SMS" : MESSAGING_PHONE_DISABLED_TITLE}
        aria-label={canMessage ? "Préparer un SMS" : MESSAGING_PHONE_DISABLED_TITLE}
        onClick={() => void openChannel("sms")}
      >
        <SmsBrandIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 px-0"
        disabled={!canMessage}
        title={canMessage ? "Préparer WhatsApp" : MESSAGING_PHONE_DISABLED_TITLE}
        aria-label={canMessage ? "Préparer WhatsApp" : MESSAGING_PHONE_DISABLED_TITLE}
        onClick={() => void openChannel("whatsapp")}
      >
        <WhatsAppBrandIcon className="size-3.5" />
      </Button>
    </>
  );
}

function SmsAnticipationPicker({
  pipe,
  text,
  onTextChange,
  onSelectionChange,
}: {
  pipe: ParrainagePipeRecord;
  text: string;
  onTextChange: (text: string) => void;
  onSelectionChange?: (profile: SmsAnticipationProfile, variant: SmsAnticipationVariant) => void;
}) {
  const [profile, setProfile] = useState<SmsAnticipationProfile>("PROCHE_AMI");
  const [variant, setVariant] = useState<SmsAnticipationVariant>("A");

  const applyTemplate = (nextProfile: SmsAnticipationProfile, nextVariant: SmsAnticipationVariant) => {
    const available = availableSmsAnticipationVariants(nextProfile);
    const resolvedVariant = available.includes(nextVariant) ? nextVariant : available[0];
    setProfile(nextProfile);
    setVariant(resolvedVariant);
    onTextChange(renderSmsAnticipationTemplate(nextProfile, resolvedVariant, pipe.contact_prenom ?? ""));
    onSelectionChange?.(nextProfile, resolvedVariant);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  const def = SMS_ANTICIPATION_PROFILE_DEFS[profile];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Profil du contact</Label>
        <Select
          value={profile}
          onValueChange={(v) => applyTemplate(v as SmsAnticipationProfile, variant)}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SMS_ANTICIPATION_COACH_PROFILES.map((key) => (
              <SelectItem key={key} value={key}>
                {SMS_ANTICIPATION_PROFILE_DEFS[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">{def.pourQui}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {availableSmsAnticipationVariants(profile).map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={variant === v ? "default" : "outline"}
            className="h-7 text-[11px]"
            onClick={() => applyTemplate(profile, v)}
          >
            {def.variants[v]?.label}
          </Button>
        ))}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground">SMS d&apos;anticipation</Label>
          <div className="flex items-center gap-0.5">
            <CoachMessagingChannelButtons
              telephone={pipe.contact_telephone}
              message={text}
            />
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void copy()}>
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>
        <Textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={4}
          className="text-sm"
        />
        {text.includes("[") && (
          <p className="text-[11px] text-amber-600">
            Pensez à compléter le champ entre crochets avant l&apos;envoi.
          </p>
        )}
      </div>
    </div>
  );
}

function SmsAnticipationInitialReplyPicker({
  options,
  text,
  onTextChange,
}: {
  options: SmsAnticipationInitialReplyOption[];
  text: string;
  onTextChange: (text: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");
  const selectedOption = options.find((o) => o.id === selectedId);

  const applyOption = (optionId: string) => {
    const option = options.find((o) => o.id === optionId);
    if (!option) return;
    setSelectedId(optionId);
    onTextChange(option.template);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Sa réponse au SMS</Label>
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={selectedId === option.id ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => applyOption(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        {selectedOption && (
          <p className="text-[11px] text-muted-foreground">
            S&apos;il dit : « {selectedOption.says} »
          </p>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground">Réponse à envoyer</Label>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void copy()}>
            <Copy className="size-3.5" />
          </Button>
        </div>
        <Textarea value={text} onChange={(e) => onTextChange(e.target.value)} rows={3} className="text-sm" />
      </div>
    </div>
  );
}

function SmsAnticipationProfileReplyPicker({
  profile,
  text,
  followUpText,
  onTextChange,
  onFollowUpTextChange,
  onSelectedOptionChange,
  sectionLabel = "Sa réponse au SMS",
}: {
  profile: SmsAnticipationProfile;
  text: string;
  followUpText: string;
  onTextChange: (text: string) => void;
  onFollowUpTextChange: (text: string) => void;
  onSelectedOptionChange?: (optionId: string) => void;
  sectionLabel?: string;
}) {
  const options = smsAnticipationProfileWaitingReplies(profile) ?? [];
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? "");

  const selectedOption = options.find((o) => o.id === selectedId);

  const applyOption = (optionId: string) => {
    const option = options.find((o) => o.id === optionId);
    if (!option) return;
    setSelectedId(optionId);
    onTextChange(option.template);
    onFollowUpTextChange(option.followUp?.template ?? "");
    onSelectedOptionChange?.(optionId);
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">{sectionLabel}</Label>
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={selectedId === option.id ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => applyOption(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground">Réponse à envoyer</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => void copy(text)}
          >
            <Copy className="size-3.5" />
          </Button>
        </div>
        <Textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={3}
          className="text-sm"
        />
      </div>

      {selectedOption?.followUp && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">{selectedOption.followUp.label}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => void copy(followUpText)}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <Textarea
            value={followUpText}
            onChange={(e) => onFollowUpTextChange(e.target.value)}
            rows={3}
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}

function SmsAnticipationReplyPicker({
  text,
  onTextChange,
}: {
  text: string;
  onTextChange: (text: string) => void;
}) {
  const [scenario, setScenario] = useState<SmsAnticipationReplyScenario>("FRUSTRATION");
  const [option, setOption] = useState<SmsAnticipationReplyOption>("A");

  const applyOption = (nextScenario: SmsAnticipationReplyScenario, nextOption: SmsAnticipationReplyOption) => {
    setScenario(nextScenario);
    setOption(nextOption);
    onTextChange(SMS_ANTICIPATION_REPLY_DEFS[nextScenario].options[nextOption].template);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  const def = SMS_ANTICIPATION_REPLY_DEFS[scenario];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Sa réponse au SMS</Label>
        <Select
          value={scenario}
          onValueChange={(v) => applyOption(v as SmsAnticipationReplyScenario, option)}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SMS_ANTICIPATION_REPLY_SCENARIOS.map((key) => (
              <SelectItem key={key} value={key}>
                {SMS_ANTICIPATION_REPLY_DEFS[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">{def.pourQui}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SMS_ANTICIPATION_REPLY_OPTIONS.map((o) => (
          <Button
            key={o}
            type="button"
            size="sm"
            variant={option === o ? "default" : "outline"}
            className="h-7 text-[11px]"
            onClick={() => applyOption(scenario, o)}
          >
            {def.options[o].label}
          </Button>
        ))}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground">Réponse à envoyer</Label>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void copy()}>
            <Copy className="size-3.5" />
          </Button>
        </div>
        <Textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={3}
          className="text-sm"
        />
      </div>
    </div>
  );
}

function SmsAnticipationObjectionPicker({
  text,
  onTextChange,
}: {
  text: string;
  onTextChange: (text: string) => void;
}) {
  const [option, setOption] = useState<SmsAnticipationReplyOption>("A");

  const applyOption = (nextOption: SmsAnticipationReplyOption) => {
    setOption(nextOption);
    onTextChange(SMS_ANTICIPATION_INSISTE_SMS_DEF.options[nextOption].template);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  return (
    <div
      className="space-y-3 rounded-md border border-dashed border-amber-300/80 bg-amber-50/60 p-3 dark:border-amber-500/45 dark:bg-amber-950/25"
    >
      <div className="text-xs font-medium text-amber-900 dark:text-amber-100">
        {SMS_ANTICIPATION_INSISTE_SMS_DEF.label}
      </div>
      <p className="text-[11px] text-amber-800/80 dark:text-amber-200/80">
        {SMS_ANTICIPATION_INSISTE_SMS_DEF.pourQui}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {SMS_ANTICIPATION_REPLY_OPTIONS.map((o) => (
          <Button
            key={o}
            type="button"
            size="sm"
            variant={option === o ? "default" : "outline"}
            className="h-7 text-[11px]"
            onClick={() => applyOption(o)}
          >
            {SMS_ANTICIPATION_INSISTE_SMS_DEF.options[o].label}
          </Button>
        ))}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground">Réponse si insiste pour du SMS</Label>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void copy()}>
            <Copy className="size-3.5" />
          </Button>
        </div>
        <Textarea value={text} onChange={(e) => onTextChange(e.target.value)} rows={3} className="text-sm" />
      </div>
    </div>
  );
}

function SmsAnticipationComposeSection({
  pipe,
  onNoteSaved,
  onAdvanceStage,
}: {
  pipe: ParrainagePipeRecord;
  onNoteSaved?: () => void | Promise<void>;
  onAdvanceStage?: () => Promise<boolean> | boolean;
}) {
  const [teaserText, setTeaserText] = useState(() =>
    renderSmsAnticipationTemplate("PROCHE_AMI", "A", pipe.contact_prenom ?? "")
  );
  const [profile, setProfile] = useState<SmsAnticipationProfile>("PROCHE_AMI");
  const [variant, setVariant] = useState<SmsAnticipationVariant>("A");
  const [advancing, setAdvancing] = useState(false);

  const markSmsSent = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAdvancing(true);
    try {
      const advanced = await onAdvanceStage?.();
      if (advanced === false) {
        return;
      }
      await createParrainagePipeSmsSentNote(
        pipe.id,
        formatSmsAnticipationSentNote(profile, variant, teaserText)
      );
      onNoteSaved?.();
      fireConfettiBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      toast.success("SMS envoyé — en attente de réponse");
    } catch (error) {
      toast.error(formatParrainagePipeError(error));
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="space-y-3">
      <SmsAnticipationPicker
        pipe={pipe}
        text={teaserText}
        onTextChange={setTeaserText}
        onSelectionChange={(nextProfile, nextVariant) => {
          setProfile(nextProfile);
          setVariant(nextVariant);
        }}
      />
      <Button type="button" size="sm" onClick={(e) => void markSmsSent(e)} disabled={advancing}>
        SMS envoyé
      </Button>
    </div>
  );
}

function SmsAnticipationWaitingSection({
  pipe,
  profile,
  profileLabel,
  onNoteSaved,
  onAdvanceStage,
}: {
  pipe: ParrainagePipeRecord;
  profile?: SmsAnticipationProfile | null;
  profileLabel?: string | null;
  onNoteSaved?: () => void | Promise<void>;
  onAdvanceStage?: () => Promise<boolean> | boolean;
}) {
  const profileReplies = smsAnticipationProfileWaitingReplies(profile);
  const initialReplies = smsAnticipationProfileInitialReplies(profile);
  const defaultInitialReplyText =
    initialReplies?.[0]?.template ?? SMS_ANTICIPATION_REPLY_DEFS.FRUSTRATION.options.A.template;
  const defaultReplyText =
    profileReplies?.[0]?.template ?? SMS_ANTICIPATION_REPLY_DEFS.FRUSTRATION.options.A.template;

  const defaultFollowUpText = profileReplies?.[0]?.followUp?.template ?? "";

  const [initialReplyText, setInitialReplyText] = useState(defaultInitialReplyText);
  const [replyText, setReplyText] = useState(defaultReplyText);
  const [followUpText, setFollowUpText] = useState(defaultFollowUpText);
  const [selectedProfileReplyId, setSelectedProfileReplyId] = useState(
    () => profileReplies?.[0]?.id ?? ""
  );
  const showInsisteSmsPicker = profileReplyShowsInsisteSmsPicker(
    profile,
    selectedProfileReplyId,
    Boolean(profileReplies)
  );
  const [objectionText, setObjectionText] = useState(
    () => SMS_ANTICIPATION_INSISTE_SMS_DEF.options.A.template
  );
  const defaultCallSchedule = defaultParrainageCallSchedule();
  const [planCall, setPlanCall] = useState(false);
  const [callDateInput, setCallDateInput] = useState(defaultCallSchedule.dateInput);
  const [callTimeInput, setCallTimeInput] = useState(defaultCallSchedule.timeInput);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    setInitialReplyText(defaultInitialReplyText);
    setReplyText(defaultReplyText);
    setFollowUpText(defaultFollowUpText);
    setSelectedProfileReplyId(profileReplies?.[0]?.id ?? "");
    const schedule = defaultParrainageCallSchedule();
    setPlanCall(false);
    setCallDateInput(schedule.dateInput);
    setCallTimeInput(schedule.timeInput);
  }, [
    pipe.id,
    profile,
    defaultInitialReplyText,
    defaultReplyText,
    defaultFollowUpText,
    profileReplies,
  ]);

  const markRelanceSent = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAdvancing(true);
    try {
      const plannedCallEcheance = planCall
        ? localDateTimeInputToUnix(callDateInput, callTimeInput)
        : null;
      if (planCall && plannedCallEcheance == null) {
        toast.error("Date ou heure d'appel invalide — rebond non enregistré.");
        return;
      }

      const relanceNote = followUpText.trim()
        ? `Relance (selon sa réponse) :\n${replyText}\n\n${followUpText}`
        : `Relance (selon sa réponse) :\n${replyText}`;
      const callScheduleLabel =
        planCall && plannedCallEcheance != null
          ? formatParrainageCallScheduleLabel(callDateInput, callTimeInput)
          : null;
      let combined = initialReplies
        ? `Réponse (sa situation) :\n${initialReplyText}\n\n${relanceNote}`
        : relanceNote;
      if (showInsisteSmsPicker) {
        combined = `${combined}\n\nSi insiste pour du SMS :\n${objectionText}`;
      }
      if (callScheduleLabel) {
        combined = `${combined}\n\nAppel planifié : ${callScheduleLabel}`;
      }

      await createParrainagePipeTimelineNote(pipe.id, combined);
      if (planCall && plannedCallEcheance != null) {
        await createTache({
          contact_ids: [pipe.contact_id],
          titre: `Appel parrainage — ${formatParrainageContactLabel(pipe)}`,
          description: `Exercice ${pipe.exercice_label} — pipe parrainage, étape Prise de contact.`,
          date_echeance: plannedCallEcheance,
          priorite: "NORMALE",
          statut: "A_FAIRE",
        });
      }
      await onNoteSaved?.();

      const advanced = await onAdvanceStage?.();
      if (advanced === false) {
        return;
      }
      fireConfettiBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      toast.success(
        planCall
          ? "Rebond envoyé — appel planifié dans les tâches"
          : "Rebond envoyé — étape « Prise de contact »"
      );
    } catch (error) {
      toast.error(formatParrainagePipeError(error));
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium">Attente de réponse</span>
        {profileLabel && (
          <span className="text-sm text-muted-foreground">{profileLabel}</span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Préparez la relance selon sa réponse — le script d&apos;appel arrive à l&apos;étape suivante.
      </p>
      {profile && initialReplies && (
        <SmsAnticipationInitialReplyPicker
          key={`${pipe.id}-initial`}
          options={initialReplies}
          text={initialReplyText}
          onTextChange={setInitialReplyText}
        />
      )}
      {profile && profileReplies ? (
        <SmsAnticipationProfileReplyPicker
          key={`${pipe.id}-${profile}`}
          profile={profile}
          text={replyText}
          followUpText={followUpText}
          onTextChange={setReplyText}
          onFollowUpTextChange={setFollowUpText}
          onSelectedOptionChange={setSelectedProfileReplyId}
          sectionLabel={initialReplies ? "Relance selon sa réponse" : "Sa réponse au SMS"}
        />
      ) : (
        <SmsAnticipationReplyPicker text={replyText} onTextChange={setReplyText} />
      )}
      {showInsisteSmsPicker && (
        <SmsAnticipationObjectionPicker text={objectionText} onTextChange={setObjectionText} />
      )}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={planCall}
            onCheckedChange={(checked) => setPlanCall(checked === true)}
            disabled={advancing}
          />
          Planifier l&apos;appel
        </label>
        {planCall && (
          <div className="flex flex-wrap items-end gap-2 pl-6">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={callDateInput}
                onChange={(e) => setCallDateInput(e.target.value)}
                disabled={advancing}
                className="h-9 w-[9.5rem]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Heure</Label>
              <Input
                type="time"
                value={callTimeInput}
                onChange={(e) => setCallTimeInput(e.target.value)}
                disabled={advancing}
                className="h-9 w-[7.5rem]"
              />
            </div>
          </div>
        )}
      </div>
      <Button type="button" size="sm" onClick={(e) => void markRelanceSent(e)} disabled={advancing}>
        Rebond envoyé → Prise de contact
      </Button>
    </div>
  );
}

function ConfirmeInvitationSection({
  pipe,
  invitationSummary,
  invitationType,
  onPipeUpdated,
  onNoteSaved,
}: {
  pipe: ParrainagePipeRecord;
  invitationSummary: string | null;
  invitationType: string;
  onPipeUpdated: (pipe: ParrainagePipeRecord) => void;
  onNoteSaved?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [showAbsentChoices, setShowAbsentChoices] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const busyRef = useRef(false);

  const runAction = async (
    action: () => Promise<ParrainagePipeRecord>,
    successMessage: string,
    options?: { confettiTarget?: HTMLElement | null }
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const updated = await action();
      onPipeUpdated(updated);
      await onNoteSaved?.();
      if (options?.confettiTarget) {
        const rect = options.confettiTarget.getBoundingClientRect();
        fireConfettiBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
      toast.success(successMessage);
      setShowAbsentChoices(false);
      setRescheduleDate("");
    } catch (error) {
      toast.error(formatParrainagePipeError(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!invitationSummary) {
    return (
      <p className="text-sm text-muted-foreground">
        Renseignez le type et la date de la JD ou PO dans le panneau de gauche.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm font-medium">Oui, je viens</p>
        <p className="text-base text-foreground">{invitationSummary}</p>
      </div>

      {!showAbsentChoices ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={(e) =>
              void runAction(
                () => recordParrainageJdPresent(pipe, invitationSummary),
                "Présence enregistrée",
                { confettiTarget: e.currentTarget }
              )
            }
          >
            Présent
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setShowAbsentChoices(true)}
          >
            Absent
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-4">
          <p className="text-sm font-medium">Absent — que faire ?</p>
          <div className="space-y-2">
            <Label htmlFor="parrainage-reschedule-date">Nouvelle date JD/PO</Label>
            <Input
              id="parrainage-reschedule-date"
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              disabled={busy}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={busy || !rescheduleDate.trim()}
              onClick={() =>
                void runAction(
                  () => recordParrainageJdAbsentReschedule(pipe, rescheduleDate, invitationType),
                  `Reporté au ${formatParrainageInvitationDateLabel(rescheduleDate) ?? rescheduleDate}`
                )
              }
            >
              Reporter avec cette date
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void runAction(
                  () => recordParrainageJdAbsentNoDate(pipe, invitationSummary),
                  "Déplacé vers À replanifier"
                )
              }
            >
              Sans date pour l&apos;instant
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void runAction(
                  () => recordParrainageJdAbandon(pipe, invitationSummary),
                  "Abandon enregistré"
                )
              }
            >
              Abandon
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setShowAbsentChoices(false);
                setRescheduleDate("");
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReporteReplanifierSection({
  pipe,
  invitationType,
  onPipeUpdated,
  onNoteSaved,
}: {
  pipe: ParrainagePipeRecord;
  invitationType: string;
  onPipeUpdated: (pipe: ParrainagePipeRecord) => void;
  onNoteSaved?: () => void | Promise<void>;
}) {
  const [newDate, setNewDate] = useState("");
  const [type, setType] = useState(invitationType || "JD");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    setType(invitationType || "JD");
  }, [pipe.id, invitationType]);

  const submit = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (busyRef.current) return;
    if (!newDate.trim()) {
      toast.error(parrainageInvitationDateRequiredMessage());
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const updated = await replanifyParrainageWithNewDate(pipe, newDate, type);
      onPipeUpdated(updated);
      await onNoteSaved?.();
      const rect = event.currentTarget.getBoundingClientRect();
      fireConfettiBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      toast.success(
        `Nouvelle date — ${formatParrainageInvitationSummary(type, newDate) ?? newDate}`
      );
      setNewDate("");
    } catch (error) {
      toast.error(formatParrainagePipeError(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Le filleul s&apos;est absenté sans date de report. Rappelez-le pour fixer une nouvelle JD ou
        PO.
      </p>
      <div className="space-y-3 rounded-md border border-orange-200/70 bg-orange-50/40 p-4 dark:border-orange-900 dark:bg-orange-950/20">
        <div className="space-y-2">
          <Label>Type d&apos;invitation</Label>
          <Select value={type} onValueChange={setType} disabled={busy}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PARRAINAGE_INVITATION_TYPES.map((invType) => (
                <SelectItem key={invType} value={invType}>
                  {PARRAINAGE_INVITATION_LABELS[invType]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="parrainage-replanify-date">Nouvelle date</Label>
          <Input
            id="parrainage-replanify-date"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            disabled={busy}
          />
        </div>
        <Button type="button" size="sm" disabled={busy || !newDate.trim()} onClick={(e) => void submit(e)}>
          Date fixée → Oui, je viens
        </Button>
      </div>
    </div>
  );
}

function AppelPriseContactSection({
  pipe,
  invitationType,
  invitationDateInput,
  onInvitationTypeChange,
  onInvitationDateChange,
  plannedCallLabel,
  onNoteSaved,
  onAdvanceStage,
  onSaveInvitationMeta,
}: {
  pipe: ParrainagePipeRecord;
  invitationType: string;
  invitationDateInput: string;
  onInvitationTypeChange: (value: string) => void;
  onInvitationDateChange: (value: string) => void;
  plannedCallLabel?: string | null;
  onNoteSaved?: () => void | Promise<void>;
  onAdvanceStage?: () => Promise<boolean> | boolean;
  onSaveInvitationMeta?: () => Promise<ParrainagePipeRecord | null>;
}) {
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      APPEL_PRISE_CONTACT_ALL_STEPS.map((step) => [
        step.id,
        renderAppelPriseContactStep(step.template, pipe.contact_prenom ?? ""),
      ])
    )
  );
  const [followUpTexts, setFollowUpTexts] = useState<Record<string, string>>(() =>
    buildAppelPriseContactFollowUpTexts(APPEL_PRISE_CONTACT_ALL_STEPS)
  );
  const [variantByStep, setVariantByStep] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      APPEL_PRISE_CONTACT_ALL_STEPS
        .filter((step) => step.variants)
        .map((step) => [step.id, step.variants![0].id])
    )
  );
  const [advancing, setAdvancing] = useState(false);
  const advancingRef = useRef(false);

  useEffect(() => {
    setTexts(
      Object.fromEntries(
        APPEL_PRISE_CONTACT_ALL_STEPS.map((step) => [
          step.id,
          renderAppelPriseContactStep(step.template, pipe.contact_prenom ?? ""),
        ])
      )
    );
    setFollowUpTexts(buildAppelPriseContactFollowUpTexts(APPEL_PRISE_CONTACT_ALL_STEPS));
    setVariantByStep(
      Object.fromEntries(
        APPEL_PRISE_CONTACT_ALL_STEPS
          .filter((step) => step.variants)
          .map((step) => [step.id, step.variants![0].id])
      )
    );
  }, [pipe.id, pipe.contact_prenom]);

  useEffect(() => {
    const scriptDate = invitationDateInput.trim()
      ? formatParrainageScriptInvitationDate(invitationDateInput)
      : "[X]";
    setTexts((prev) => {
      const current = prev.confirmation_date ?? "";
      const base = renderAppelPriseContactStep(
        APPEL_PRISE_CONTACT_STEPS.find((step) => step.id === "confirmation_date")!.template,
        pipe.contact_prenom ?? ""
      );
      const next = base.replace("[X]", scriptDate);
      if (current === next) return prev;
      return { ...prev, confirmation_date: next };
    });
  }, [invitationDateInput, pipe.contact_prenom]);

  const applyVariant = (step: AppelPriseContactStepDef, variantId: string) => {
    const variant = step.variants?.find((v) => v.id === variantId);
    if (!variant) return;
    setVariantByStep((prev) => ({ ...prev, [step.id]: variantId }));
    setTexts((prev) => ({
      ...prev,
      [step.id]: renderAppelPriseContactStep(variant.template, pipe.contact_prenom ?? ""),
    }));
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  const markDone = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (advancingRef.current) {
      return;
    }
    if (!invitationType) {
      toast.error(parrainageInvitationRequiredMessage("CONFIRME"));
      return;
    }
    if (!invitationDateInput.trim()) {
      toast.error(parrainageInvitationDateRequiredMessage());
      return;
    }
    const invitationDateLabel = formatParrainageInvitationDateLabel(invitationDateInput);
    if (!invitationDateLabel) {
      toast.error(parrainageInvitationDateRequiredMessage());
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    advancingRef.current = true;
    setAdvancing(true);
    try {
      if (onSaveInvitationMeta) {
        const saved = await onSaveInvitationMeta();
        if (saved === null) {
          return;
        }
      }

      const advanced = await onAdvanceStage?.();
      if (advanced === false) {
        return;
      }
      const formatStepNote = (step: AppelPriseContactStepDef) => {
        const primary = texts[step.id]?.trim();
        const followUp = followUpTexts[step.id]?.trim();
        const content =
          primary && followUp ? `${primary}\n\n${followUp}` : followUp || primary || "";
        return `${step.title} :\n${content}`;
      };
      const combinedSteps = APPEL_PRISE_CONTACT_STEPS.map(formatStepNote).join("\n\n");
      const combinedObjections = APPEL_PRISE_CONTACT_OBJECTIONS.map(formatStepNote).join("\n\n");
      const invitationLabel =
        PARRAINAGE_INVITATION_LABELS[invitationType as ParrainageInvitationType];
      const invitationLine = `Type d'invitation : ${invitationLabel} (${invitationType})`;
      const invitationDateLine = `Date JD/PO : ${invitationDateLabel}`;
      const scheduleLine = plannedCallLabel ? `Appel planifié : ${plannedCallLabel}` : null;
      const header = [invitationLine, invitationDateLine, scheduleLine].filter(Boolean).join("\n");
      await createParrainagePipeTimelineNote(
        pipe.id,
        `${header}\n\nScript d'appel :\n\n${combinedSteps}\n\nObjections possibles :\n\n${combinedObjections}`
      );
      try {
        const dossier = await getFilleulDossier(pipe.contact_id).catch(() =>
          emptyFilleulDossier(pipe.contact_id)
        );
        await upsertFilleulDossier(
          buildUpsertFilleulDossierInput(dossier, { dateInvitation: invitationDateInput }),
          { notifyContactsChanged: true }
        );
      } catch {
        // Non bloquant : l'étape et l'historique restent enregistrés.
      }
      let confirmationTaskCreated = false;
      try {
        const confirmationDue = parrainagePresenceConfirmationDueUnix(invitationDateInput);
        const confirmationTitle = formatParrainagePresenceConfirmationTaskTitle(
          formatParrainageContactLabel(pipe),
          invitationType,
          invitationDateInput
        );
        if (confirmationDue != null && confirmationTitle) {
          await createTache({
            contact_ids: [pipe.contact_id],
            titre: confirmationTitle,
            description: `Exercice ${pipe.exercice_label} — pipe parrainage #${pipe.id}. Rappel J-1 pour confirmer la présence.`,
            date_echeance: confirmationDue,
            priorite: "NORMALE",
            statut: "A_FAIRE",
          });
          confirmationTaskCreated = true;
        }
      } catch {
        // Non bloquant.
      }
      onNoteSaved?.();
      fireConfettiBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      const summary = formatParrainageInvitationSummary(invitationType, invitationDateInput);
      const toastParts = [
        summary ? `Appel effectué — ${summary}` : "Appel effectué — étape suivante",
        confirmationTaskCreated ? "rappel J-1 dans les tâches" : null,
      ].filter(Boolean);
      toast.success(toastParts.join(" · "));
    } catch (error) {
      toast.error(formatParrainagePipeError(error));
    } finally {
      advancingRef.current = false;
      setAdvancing(false);
    }
  };

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const renderStepBlock = (step: AppelPriseContactStepDef) => (
    <div key={step.id} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">{step.title}</Label>
        {step.note && <p className="text-[11px] text-muted-foreground">{step.note}</p>}
      </div>
      {step.variants && (
        <div className="flex flex-wrap gap-1.5">
          {step.variants.map((v) => (
            <Button
              key={v.id}
              type="button"
              size="sm"
              variant={variantByStep[step.id] === v.id ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => applyVariant(step, v.id)}
            >
              {v.label}
            </Button>
          ))}
        </div>
      )}
      {step.followUp ? (
        <CoachScriptReplyFields
          primaryText={texts[step.id]}
          onPrimaryChange={(text) => setTexts((prev) => ({ ...prev, [step.id]: text }))}
          followUp={step.followUp}
          followUpText={followUpTexts[step.id]}
          onFollowUpChange={(text) =>
            setFollowUpTexts((prev) => ({ ...prev, [step.id]: text }))
          }
          onCopy={copy}
          autoResize={autoResize}
          primaryLabel="Réponse à envoyer"
          primaryRows={2}
        />
      ) : (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">Script</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => void copy(texts[step.id])}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <Textarea
            ref={autoResize}
            value={texts[step.id]}
            onChange={(e) => {
              setTexts((prev) => ({ ...prev, [step.id]: e.target.value }));
              autoResize(e.target);
            }}
            rows={2}
            className="text-sm resize-none overflow-hidden"
          />
        </div>
      )}
      {step.expectedReply && (
        <p className="text-[11px] italic text-muted-foreground">
          (Réponse attendue : {step.expectedReply})
        </p>
      )}
      {step.headsUp && <p className="text-[11px] italic text-muted-foreground">{step.headsUp}</p>}
      {texts[step.id].includes("[") && (
        <p className="text-[11px] text-amber-600">
          Pensez à compléter le champ entre crochets avant l&apos;appel.
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {plannedCallLabel && (
        <div className="space-y-1.5">
          <Label className="text-xs">Appel planifié</Label>
          <p className="text-sm text-muted-foreground">{plannedCallLabel}</p>
        </div>
      )}

      {APPEL_PRISE_CONTACT_STEPS.map(renderStepBlock)}

      <AppelPriseContactObjectionsPicker
        texts={texts}
        followUpTexts={followUpTexts}
        onTextChange={(stepId, text) => setTexts((prev) => ({ ...prev, [stepId]: text }))}
        onFollowUpTextChange={(stepId, text) =>
          setFollowUpTexts((prev) => ({ ...prev, [stepId]: text }))
        }
        onCopy={copy}
        autoResize={autoResize}
      />

      <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
        <p className="text-xs font-medium">Invitation confirmée à l&apos;appel</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Type d&apos;invitation</Label>
            <Select
              value={invitationType || "none"}
              onValueChange={(v) => onInvitationTypeChange(v === "none" ? "" : v)}
              disabled={advancing}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="JD ou PO" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non renseigné</SelectItem>
                {PARRAINAGE_INVITATION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PARRAINAGE_INVITATION_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Date de la JD ou PO</Label>
            <Input
              type="date"
              value={invitationDateInput}
              onChange={(e) => onInvitationDateChange(e.target.value)}
              disabled={advancing}
              className="h-9"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Date confirmée avec le prospect lors de l&apos;appel.
        </p>
      </div>

      <Button type="button" size="sm" onClick={(e) => void markDone(e)} disabled={advancing}>
        Appel effectué → étape suivante
      </Button>
    </div>
  );
}

interface ParrainageScriptPanelProps {
  pipe: ParrainagePipeRecord;
  smsAnticipationProfile?: SmsAnticipationProfile | null;
  smsAnticipationProfileLabel?: string | null;
  invitationType?: string;
  invitationDateInput?: string;
  invitationSummary?: string | null;
  onInvitationTypeChange?: (value: string) => void;
  onInvitationDateChange?: (value: string) => void;
  onSaveInvitationMeta?: () => Promise<ParrainagePipeRecord | null>;
  plannedCallLabel?: string | null;
  onNoteSaved?: () => void | Promise<void>;
  onAdvanceStage?: () => Promise<boolean> | boolean;
  onPipeUpdated?: (pipe: ParrainagePipeRecord) => void;
}

export function ParrainageScriptPanel({
  pipe,
  smsAnticipationProfile = null,
  smsAnticipationProfileLabel = null,
  invitationType = "",
  invitationDateInput = "",
  invitationSummary = null,
  onInvitationTypeChange,
  onInvitationDateChange,
  onSaveInvitationMeta,
  plannedCallLabel = null,
  onNoteSaved,
  onAdvanceStage,
  onPipeUpdated,
}: ParrainageScriptPanelProps) {
  const stage = pipe.stage as ParrainagePipeStage;
  const isInscrit = stage === "INSCRIT";
  const isAContacter = stage === "A_CONTACTER";
  const isAttenteReponse = stage === "ATTENTE_REPONSE";
  const isPriseDeContact = stage === "PRISE_DE_CONTACT";
  const isConfirme = stage === "CONFIRME";
  const isReporte = stage === "REPORTE";

  const handlePipeUpdated = (updated: ParrainagePipeRecord) => {
    onPipeUpdated?.(updated);
  };

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          Coach Marketing Relationnel
        </CardTitle>
        <CardDescription className="text-xs">
          {isAContacter
            ? "SMS d'anticipation — textes prêts à l'emploi selon le profil relationnel du contact."
            : isAttenteReponse
              ? "Attente de réponse au SMS d'anticipation — préparez la relance selon sa teneur."
            : isPriseDeContact
              ? "Script d'appel — prospect au téléphone."
              : isConfirme
                ? "Confirmation obtenue — invitation JD ou PO."
                : isReporte
                  ? "Absent sans date — obtenir une nouvelle JD ou PO."
              : `Étape « ${PARRAINAGE_PIPE_STAGE_LABELS[stage]} ».`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isInscrit ? (
          <p className="text-sm text-muted-foreground">
            Contact déjà inscrit — pas de script de prospection à générer.
          </p>
        ) : isAContacter ? (
          <SmsAnticipationComposeSection
            pipe={pipe}
            onNoteSaved={onNoteSaved}
            onAdvanceStage={onAdvanceStage}
          />
        ) : isAttenteReponse ? (
          <SmsAnticipationWaitingSection
            pipe={pipe}
            profile={smsAnticipationProfile}
            profileLabel={smsAnticipationProfileLabel}
            onNoteSaved={onNoteSaved}
            onAdvanceStage={onAdvanceStage}
          />
        ) : isPriseDeContact ? (
          <AppelPriseContactSection
            pipe={pipe}
            invitationType={invitationType}
            invitationDateInput={invitationDateInput}
            onInvitationTypeChange={onInvitationTypeChange ?? (() => undefined)}
            onInvitationDateChange={onInvitationDateChange ?? (() => undefined)}
            plannedCallLabel={plannedCallLabel}
            onNoteSaved={onNoteSaved}
            onAdvanceStage={onAdvanceStage}
            onSaveInvitationMeta={onSaveInvitationMeta}
          />
        ) : isConfirme ? (
          <ConfirmeInvitationSection
            pipe={pipe}
            invitationSummary={invitationSummary}
            invitationType={invitationType}
            onPipeUpdated={handlePipeUpdated}
            onNoteSaved={onNoteSaved}
          />
        ) : isReporte ? (
          <ReporteReplanifierSection
            pipe={pipe}
            invitationType={invitationType}
            onPipeUpdated={handlePipeUpdated}
            onNoteSaved={onNoteSaved}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Pas encore de script pour cette étape.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
