import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { createParrainagePipeSmsSentNote } from "@/lib/api/tauri-parrainage-pipe";
import {
  availableSmsAnticipationVariants,
  renderSmsAnticipationTemplate,
  SMS_ANTICIPATION_INSISTE_SMS_DEF,
  SMS_ANTICIPATION_PROFILE_DEFS,
  SMS_ANTICIPATION_PROFILES,
  SMS_ANTICIPATION_REPLY_DEFS,
  SMS_ANTICIPATION_REPLY_OPTIONS,
  SMS_ANTICIPATION_REPLY_SCENARIOS,
  type SmsAnticipationProfile,
  type SmsAnticipationReplyOption,
  type SmsAnticipationReplyScenario,
  type SmsAnticipationVariant,
} from "@/lib/parrainage-coach/sms-anticipation-templates";
import { PARRAINAGE_PIPE_STAGE_LABELS, type ParrainagePipeStage } from "@/lib/parrainage-pipe/parrainage-pipe-types";
import { fireConfettiBurst } from "@/lib/ui/confetti-burst";
import { toast } from "sonner";

function SmsAnticipationPicker({
  pipe,
  text,
  onTextChange,
}: {
  pipe: ParrainagePipeRecord;
  text: string;
  onTextChange: (text: string) => void;
}) {
  const [profile, setProfile] = useState<SmsAnticipationProfile>("PASSE_PARTOUT");
  const [variant, setVariant] = useState<SmsAnticipationVariant>("A");

  const applyTemplate = (nextProfile: SmsAnticipationProfile, nextVariant: SmsAnticipationVariant) => {
    const available = availableSmsAnticipationVariants(nextProfile);
    const resolvedVariant = available.includes(nextVariant) ? nextVariant : available[0];
    setProfile(nextProfile);
    setVariant(resolvedVariant);
    onTextChange(renderSmsAnticipationTemplate(nextProfile, resolvedVariant, pipe.contact_prenom ?? ""));
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
    <div className="space-y-3 border-t border-border/50 pt-3">
      <div className="text-xs font-medium text-muted-foreground">
        Attente de réponse...
      </div>

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
    <div className="space-y-3 rounded-md border border-dashed border-border/60 p-3">
      <div className="text-xs font-medium text-muted-foreground">{SMS_ANTICIPATION_INSISTE_SMS_DEF.label}</div>
      <p className="text-[11px] text-muted-foreground">{SMS_ANTICIPATION_INSISTE_SMS_DEF.pourQui}</p>

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

function SmsAnticipationSection({
  pipe,
  onNoteSaved,
  onAdvanceStage,
}: {
  pipe: ParrainagePipeRecord;
  onNoteSaved?: () => void;
  onAdvanceStage?: () => Promise<boolean> | boolean;
}) {
  const [teaserText, setTeaserText] = useState(() =>
    renderSmsAnticipationTemplate("PASSE_PARTOUT", "A", pipe.contact_prenom ?? "")
  );
  const [replyText, setReplyText] = useState(
    () => SMS_ANTICIPATION_REPLY_DEFS.FRUSTRATION.options.A.template
  );
  const [objectionText, setObjectionText] = useState(
    () => SMS_ANTICIPATION_INSISTE_SMS_DEF.options.A.template
  );
  const [advancing, setAdvancing] = useState(false);

  const markSent = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAdvancing(true);
    try {
      // On avance d'abord l'étape : si ça échoue (erreur déjà affichée par le parent), on
      // n'enregistre ni la note ni le compteur, pour éviter un état incohérent / une note dupliquée.
      const advanced = await onAdvanceStage?.();
      if (advanced === false) {
        return;
      }
      const combined = `SMS d'anticipation :\n${teaserText}\n\nRelance (selon sa réponse) :\n${replyText}\n\nSi insiste pour du SMS :\n${objectionText}`;
      await createParrainagePipeSmsSentNote(pipe.id, combined);
      onNoteSaved?.();
      fireConfettiBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      toast.success("SMS envoyé — étape « Prise de contact »");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="space-y-3">
      <SmsAnticipationPicker pipe={pipe} text={teaserText} onTextChange={setTeaserText} />
      <SmsAnticipationReplyPicker text={replyText} onTextChange={setReplyText} />
      <SmsAnticipationObjectionPicker text={objectionText} onTextChange={setObjectionText} />
      <Button type="button" size="sm" onClick={(e) => void markSent(e)} disabled={advancing}>
        J&apos;ai envoyé le SMS → étape suivante
      </Button>
    </div>
  );
}

interface ParrainageScriptPanelProps {
  pipe: ParrainagePipeRecord;
  onNoteSaved?: () => void;
  onAdvanceStage?: () => Promise<boolean> | boolean;
}

export function ParrainageScriptPanel({ pipe, onNoteSaved, onAdvanceStage }: ParrainageScriptPanelProps) {
  const stage = pipe.stage as ParrainagePipeStage;
  const isInscrit = stage === "INSCRIT";
  const isAContacter = stage === "A_CONTACTER";

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
            : `Étape « ${PARRAINAGE_PIPE_STAGE_LABELS[stage]} ».`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isInscrit ? (
          <p className="text-sm text-muted-foreground">
            Contact déjà inscrit — pas de script de prospection à générer.
          </p>
        ) : isAContacter ? (
          <SmsAnticipationSection pipe={pipe} onNoteSaved={onNoteSaved} onAdvanceStage={onAdvanceStage} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Pas encore de script pour cette étape.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
