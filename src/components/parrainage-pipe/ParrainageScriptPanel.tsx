import { useEffect, useState } from "react";
import { Copy, Sparkles } from "lucide-react";
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
  SMS_ANTICIPATION_PROFILE_DEFS,
  SMS_ANTICIPATION_PROFILES,
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
  PARRAINAGE_PIPE_STAGE_LABELS,
  type ParrainagePipeStage,
} from "@/lib/parrainage-pipe/parrainage-pipe-types";
import {
  defaultParrainageCallSchedule,
  formatParrainageCallScheduleLabel,
  localDateTimeInputToUnix,
} from "@/lib/parrainage-pipe/parrainage-call-schedule";
import { fireConfettiBurst } from "@/lib/ui/confetti-burst";
import { toast } from "sonner";

function profileReplyShowsInsisteSmsPicker(
  profile: SmsAnticipationProfile | null | undefined,
  replyId: string,
  hasProfileReplies: boolean
): boolean {
  if (!hasProfileReplies) return true;
  return smsAnticipationProfileReplyShowsInsisteSms(profile, replyId);
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
            {SMS_ANTICIPATION_PROFILES.map((key) => (
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
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void copy()}>
            <Copy className="size-3.5" />
          </Button>
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
  onNoteSaved?: () => void;
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
      toast.error(String(error));
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
  onNoteSaved?: () => void;
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

      const advanced = await onAdvanceStage?.();
      if (advanced === false) {
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
      onNoteSaved?.();
      fireConfettiBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      toast.success(
        planCall
          ? "Rebond envoyé — appel planifié dans les tâches"
          : "Rebond envoyé — étape « Prise de contact »"
      );
    } catch (error) {
      toast.error(String(error));
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

function AppelPriseContactSection({
  pipe,
  onNoteSaved,
  onAdvanceStage,
}: {
  pipe: ParrainagePipeRecord;
  onNoteSaved?: () => void;
  onAdvanceStage?: () => Promise<boolean> | boolean;
}) {
  const allAppelSteps = [...APPEL_PRISE_CONTACT_STEPS, ...APPEL_PRISE_CONTACT_OBJECTIONS];

  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      allAppelSteps.map((step) => [
        step.id,
        renderAppelPriseContactStep(step.template, pipe.contact_prenom ?? ""),
      ])
    )
  );
  const [variantByStep, setVariantByStep] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      allAppelSteps.filter((step) => step.variants).map((step) => [step.id, step.variants![0].id])
    )
  );
  const [advancing, setAdvancing] = useState(false);

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
    const rect = event.currentTarget.getBoundingClientRect();
    setAdvancing(true);
    try {
      const advanced = await onAdvanceStage?.();
      if (advanced === false) {
        return;
      }
      const combinedSteps = APPEL_PRISE_CONTACT_STEPS.map(
        (step) => `${step.title} :\n${texts[step.id]}`
      ).join("\n\n");
      const combinedObjections = APPEL_PRISE_CONTACT_OBJECTIONS.map(
        (step) => `${step.title} :\n${texts[step.id]}`
      ).join("\n\n");
      await createParrainagePipeTimelineNote(
        pipe.id,
        `Script d'appel :\n\n${combinedSteps}\n\nObjections possibles :\n\n${combinedObjections}`
      );
      onNoteSaved?.();
      fireConfettiBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      toast.success("Appel effectué — étape suivante");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setAdvancing(false);
    }
  };

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const renderStepCard = (step: AppelPriseContactStepDef) => (
    <div key={step.id} className="space-y-1 rounded-md border border-border/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] font-medium leading-tight">
          {step.title}
          {step.note && <span className="ml-1 italic text-muted-foreground">— {step.note}</span>}
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 shrink-0"
          onClick={() => void copy(texts[step.id])}
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
      {step.variants && (
        <div className="flex flex-wrap gap-1.5">
          {step.variants.map((v) => (
            <Button
              key={v.id}
              type="button"
              size="sm"
              variant={variantByStep[step.id] === v.id ? "default" : "outline"}
              className="h-6 text-[11px] px-2"
              onClick={() => applyVariant(step, v.id)}
            >
              {v.label}
            </Button>
          ))}
        </div>
      )}
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
    <div className="space-y-2">
      {APPEL_PRISE_CONTACT_STEPS.map(renderStepCard)}

      <div className="space-y-2 rounded-md border border-dashed border-border/60 p-2">
        <div className="text-[11px] font-medium text-muted-foreground">Objections possibles</div>
        {APPEL_PRISE_CONTACT_OBJECTIONS.map(renderStepCard)}
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
  onNoteSaved?: () => void;
  onAdvanceStage?: () => Promise<boolean> | boolean;
}

export function ParrainageScriptPanel({
  pipe,
  smsAnticipationProfile = null,
  smsAnticipationProfileLabel = null,
  onNoteSaved,
  onAdvanceStage,
}: ParrainageScriptPanelProps) {
  const stage = pipe.stage as ParrainagePipeStage;
  const isInscrit = stage === "INSCRIT";
  const isAContacter = stage === "A_CONTACTER";
  const isAttenteReponse = stage === "ATTENTE_REPONSE";
  const isPriseDeContact = stage === "PRISE_DE_CONTACT";

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
          <AppelPriseContactSection pipe={pipe} onNoteSaved={onNoteSaved} onAdvanceStage={onAdvanceStage} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Pas encore de script pour cette étape.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
