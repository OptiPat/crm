import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EtiquetteFormPanel } from "@/components/etiquettes/etiquette-form-ui";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import {
  EMAIL_TEMPLATE_CATEGORIES,
  getTemplateCategoryMeta,
  suggestTemplateIdForEtiquette,
} from "@/lib/emails/template-email-meta";
import {
  formatEmailCampaignSummary,
  type EmailEnvoiMode,
} from "@/lib/etiquettes/email-campaign-summary";
import { cn } from "@/lib/utils";
import { CalendarClock, Clock, Mail, Sparkles, Wand2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

type Props = {
  actif: boolean;
  emailActif: boolean;
  onEmailActifChange: (v: boolean) => void;
  emailTemplateId: number | null;
  onTemplateIdChange: (id: number | null) => void;
  emailEnvoiMode: EmailEnvoiMode;
  onEnvoiModeChange: (mode: EmailEnvoiMode) => void;
  emailEnvoiHeure: string;
  onEnvoiHeureChange: (v: string) => void;
  emailEnvoiLocal: string;
  onEnvoiLocalChange: (v: string) => void;
  templates: TemplateEmail[];
  nom: string;
  isAuto: boolean;
};

export function EtiquetteEmailCampaignFields({
  actif,
  emailActif,
  onEmailActifChange,
  emailTemplateId,
  onTemplateIdChange,
  emailEnvoiMode,
  onEnvoiModeChange,
  emailEnvoiHeure,
  onEnvoiHeureChange,
  emailEnvoiLocal,
  onEnvoiLocalChange,
  templates,
  nom,
  isAuto,
}: Props) {
  const selectedTemplate = templates.find((t) => t.id === emailTemplateId) ?? null;

  const templatesByCategory = useMemo(() => {
    const map = new Map<string, TemplateEmail[]>();
    for (const t of templates) {
      const cat = t.categorie || "AUTRE";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return EMAIL_TEMPLATE_CATEGORIES.map((c) => ({
      ...c,
      items: (map.get(c.id) ?? []).sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
    })).filter((g) => g.items.length > 0);
  }, [templates]);

  const summary = formatEmailCampaignSummary({
    active: emailActif,
    template: selectedTemplate,
    mode: emailEnvoiMode,
    envoiHeure: emailEnvoiHeure,
    envoiLocal: emailEnvoiLocal,
    hasAutoRule: isAuto,
    etiquetteNom: nom.trim(),
  });

  const handleSuggest = () => {
    const id = suggestTemplateIdForEtiquette(nom, templates);
    if (id) {
      onTemplateIdChange(id);
      toast.success("Modèle suggéré pour cette étiquette");
    } else {
      toast.info("Aucun modèle correspondant — créez-en un dans Paramètres → Templates email");
    }
  };

  return (
    <EtiquetteFormPanel
      title="Campagne email"
      description="Les emails arrivent dans Suivi → Envois ; vous validez chaque envoi"
    >
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Label htmlFor="email-actif" className="text-sm font-medium">
              Proposer des emails pour cette étiquette
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sans activation, rien n&apos;apparaît dans la file d&apos;envoi.
            </p>
          </div>
        </div>
        <Switch
          id="email-actif"
          checked={emailActif}
          disabled={!actif}
          onCheckedChange={onEmailActifChange}
        />
      </div>

      {!actif && (
        <p className="text-xs text-muted-foreground bg-muted/50 border rounded-lg px-3 py-2">
          Étiquette inactive : la campagne reste configurable mais ne s&apos;appliquera qu&apos;à la
          réactivation.
        </p>
      )}

      {!emailActif && (
        <p className="text-sm text-center text-muted-foreground py-6 border border-dashed rounded-lg">
          Activez l&apos;interrupteur ci-dessus pour configurer modèle et planification.
        </p>
      )}

      {emailActif && (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">
                <span className="text-muted-foreground font-normal mr-1.5">1.</span>
                Modèle d&apos;email
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                disabled={!nom.trim() || templates.length === 0}
                onClick={handleSuggest}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Suggérer
              </Button>
            </div>
            <Select
              value={emailTemplateId?.toString() || ""}
              onValueChange={(v) => onTemplateIdChange(v ? parseInt(v, 10) : null)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Choisir un modèle…" />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                {templatesByCategory.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-muted-foreground text-center">
                    Aucun modèle — créez-en dans Paramètres → Templates email
                  </p>
                ) : (
                  templatesByCategory.map((group) => (
                    <SelectGroup key={group.id}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.items.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.nom}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedTemplate && (
              <p className="text-xs text-muted-foreground">
                Catégorie {getTemplateCategoryMeta(selectedTemplate.categorie).label}
                {selectedTemplate.sujet ? ` — objet : « ${selectedTemplate.sujet} »` : ""}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              <span className="text-muted-foreground font-normal mr-1.5">2.</span>
              Quand proposer l&apos;envoi ?
            </Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={!isAuto}
                onClick={() => onEnvoiModeChange("eligibility")}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  !isAuto && "opacity-50 cursor-not-allowed",
                  emailEnvoiMode === "eligibility"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/30 hover:bg-muted/30"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium">À l&apos;éligibilité</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Le jour où la règle auto pose l&apos;étiquette, à l&apos;heure choisie.
                </p>
              </button>
              <button
                type="button"
                onClick={() => onEnvoiModeChange("fixed")}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  emailEnvoiMode === "fixed"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/30 hover:bg-muted/30"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CalendarClock className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium">Date fixe</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Même moment pour tous les contacts déjà taggés (ex. campagne IR).
                </p>
              </button>
            </div>
            {!isAuto && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2">
                « À l&apos;éligibilité » nécessite une règle automatique (onglet Règle auto). Sinon
                utilisez « Date fixe » ou posez l&apos;étiquette à la main.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              <span className="text-muted-foreground font-normal mr-1.5">3.</span>
              {emailEnvoiMode === "eligibility" ? "Heure du jour" : "Date et heure de campagne"}
            </Label>
            {emailEnvoiMode === "eligibility" ? (
              <>
                <Input
                  id="email-envoi-heure"
                  type="time"
                  value={emailEnvoiHeure}
                  onChange={(e) => onEnvoiHeureChange(e.target.value)}
                  className="max-w-[160px]"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Si l&apos;heure est déjà passée le jour de l&apos;éligibilité, l&apos;email est
                  proposé tout de suite dans la file.
                </p>
              </>
            ) : (
              <>
                <Input
                  id="email-envoi-prevu"
                  type="datetime-local"
                  value={emailEnvoiLocal}
                  onChange={(e) => onEnvoiLocalChange(e.target.value)}
                  className="max-w-[280px]"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Tous les contacts avec cette étiquette entrent en file à cette date (pensez à
                  recalculer les étiquettes si besoin).
                </p>
              </>
            )}
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex gap-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary uppercase tracking-wide">
                En résumé
              </p>
              <p className="text-sm text-foreground mt-1 leading-relaxed">{summary}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Envoi réel : <strong>Suivi → Envois → Prêts à envoyer</strong> (confirmation une par
                une).
              </p>
            </div>
          </div>
        </div>
      )}
    </EtiquetteFormPanel>
  );
}
