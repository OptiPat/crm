import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { Loader2 } from "lucide-react";
import {
  DEFAULT_NEWSLETTER_AUDIENCE_FILTERS,
  ensureNewsletterEtiquette,
  getNewsletterSettings,
  saveNewsletterSettings,
  type NewsletterAudienceFilters,
  type NewsletterSettings,
} from "@/lib/api/tauri-newsletter";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { normalizeAgendaLinks } from "@/lib/emails/agenda-links";
import { NewsletterAudiencePanel } from "@/components/newsletter/NewsletterAudiencePanel";
import { openExternalUrl } from "@/lib/api/tauri-system";
import {
  DEFAULT_MISTRAL_MODEL,
  DEFAULT_NEWSLETTER_STYLE_PROMPT,
  NEWSLETTER_STYLE_PRESETS,
} from "@/lib/newsletter/default-style-prompt";
import {
  DEFAULT_NEWSLETTER_SECONDARY,
  NEWSLETTER_LAYOUT_OPTIONS,
} from "@/lib/newsletter/newsletter-branding";
import type {
  NewsletterBodyFont,
  NewsletterBodyFontSize,
  NewsletterLayout,
  NewsletterLineHeight,
  NewsletterSectionSpacing,
  NewsletterTitleFont,
} from "@/lib/api/tauri-newsletter";
import {
  NEWSLETTER_BODY_FONT_OPTIONS,
  NEWSLETTER_FONT_SIZE_OPTIONS,
  NEWSLETTER_LINE_HEIGHT_OPTIONS,
  NEWSLETTER_SECTION_SPACING_OPTIONS,
  NEWSLETTER_TITLE_FONT_OPTIONS,
} from "@/lib/newsletter/newsletter-typography";
import { toast } from "sonner";

export function ParametresNewsletterSection({
  onSettingsSync,
  switchToComposerAfterSave = false,
  onSwitchToComposer,
}: {
  /** Met à jour l'état parent (ex. liste d'exclusions côté composer) sans navigation. */
  onSettingsSync?: (settings: NewsletterSettings) => void;
  /** Uniquement après « Enregistrer » Mistral / campagne (pas les exclusions). */
  switchToComposerAfterSave?: boolean;
  onSwitchToComposer?: () => void;
}) {
  const [settings, setSettings] = useState<NewsletterSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [stylePrompt, setStylePrompt] = useState(DEFAULT_NEWSLETTER_STYLE_PROMPT);
  const [model, setModel] = useState(DEFAULT_MISTRAL_MODEL);
  const [etiquetteNom, setEtiquetteNom] = useState("Newsletter");
  const [sendDelayMs, setSendDelayMs] = useState(3000);
  const [accentColor, setAccentColor] = useState("#0f2744");
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_NEWSLETTER_SECONDARY);
  const [defaultLayout, setDefaultLayout] = useState<NewsletterLayout>("magazine");
  const [bodyFont, setBodyFont] = useState<NewsletterBodyFont>("classic");
  const [titleFont, setTitleFont] = useState<NewsletterTitleFont>("classic");
  const [bodyFontSize, setBodyFontSize] = useState<NewsletterBodyFontSize>("md");
  const [lineHeight, setLineHeight] = useState<NewsletterLineHeight>("relaxed");
  const [sectionSpacing, setSectionSpacing] = useState<NewsletterSectionSpacing>("normal");
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [audienceFilters, setAudienceFilters] = useState<NewsletterAudienceFilters>(
    DEFAULT_NEWSLETTER_AUDIENCE_FILTERS
  );
  const [savingExclusions, setSavingExclusions] = useState(false);
  const [cgp, setCgp] = useState<CgpConfig | null>(null);
  const [agendaLinkId, setAgendaLinkId] = useState("");

  const agendaLinks = normalizeAgendaLinks(cgp);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, cgpConfig] = await Promise.all([
        getNewsletterSettings(),
        getCgpConfig().catch(() => null),
      ]);
      setCgp(cgpConfig);
      setSettings(s);
      const links = normalizeAgendaLinks(cgpConfig);
      setStylePrompt(s.stylePrompt);
      setModel(s.model);
      setEtiquetteNom(s.etiquetteNom);
      setSendDelayMs(s.sendDelayMs);
      setAccentColor(s.accentColor?.trim() || "#0f2744");
      setSecondaryColor(s.secondaryColor?.trim() || DEFAULT_NEWSLETTER_SECONDARY);
      setDefaultLayout(s.defaultLayout ?? "magazine");
      setBodyFont(s.bodyFont ?? "classic");
      setTitleFont(s.titleFont ?? "classic");
      setBodyFontSize(s.bodyFontSize ?? "md");
      setLineHeight(s.lineHeight ?? "relaxed");
      setSectionSpacing(s.sectionSpacing ?? "normal");
      setAudienceFilters(s.defaultAudienceFilters ?? DEFAULT_NEWSLETTER_AUDIENCE_FILTERS);
      setAgendaLinkId(s.agendaLinkId?.trim() || links[0]?.id || "");
      const etiq = await ensureNewsletterEtiquette(s.etiquetteNom);
      setSubscriberCount(etiq.contactCount);
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger les paramètres newsletter");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!settings?.apiKeyConfigured && !apiKeyInput.trim()) {
      toast.error("Saisissez votre clé API Mistral avant d'enregistrer");
      return;
    }
    setSaving(true);
    try {
      const payload: Parameters<typeof saveNewsletterSettings>[0] = {
        stylePrompt,
        model,
        etiquetteNom,
        sendDelayMs,
        accentColor,
        secondaryColor,
        defaultLayout,
        bodyFont,
        titleFont,
        bodyFontSize,
        lineHeight,
        sectionSpacing,
        agendaLinkId: agendaLinkId.trim() || null,
        defaultAudienceFilters: audienceFilters,
      };
      if (apiKeyInput.trim()) {
        payload.apiKey = apiKeyInput.trim();
      }
      const saved = await saveNewsletterSettings(payload);
      setSettings(saved);
      setApiKeyInput("");
      const etiq = await ensureNewsletterEtiquette(saved.etiquetteNom);
      setSubscriberCount(etiq.contactCount);
      onSettingsSync?.(saved);
      if (switchToComposerAfterSave) {
        onSwitchToComposer?.();
      }
      if (payload.apiKey) {
        toast.success("Clé Mistral enregistrée (masquée pour sécurité)");
      } else {
        toast.success("Paramètres newsletter enregistrés");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleAudienceFiltersChange = async (next: NewsletterAudienceFilters) => {
    setAudienceFilters(next);
    setSavingExclusions(true);
    try {
      const saved = await saveNewsletterSettings({ defaultAudienceFilters: next });
      setSettings(saved);
      setAudienceFilters(saved.defaultAudienceFilters ?? next);
      onSettingsSync?.(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer les exclusions");
    } finally {
      setSavingExclusions(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Chargement…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanel
        title="Clé API Mistral"
        description="Newsletters et bulletins SCPI (OCR + résumés Mistral). Clé stockée localement et chiffrée — console.mistral.ai"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="param-mistral-key">
              {settings?.apiKeyConfigured ?
                "Nouvelle clé (laisser vide pour conserver)"
              : "Clé API"}
            </Label>
            <Input
              id="param-mistral-key"
              type="password"
              autoComplete="off"
              placeholder={settings?.apiKeyConfigured ? "••••••••" : "sk-…"}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            {settings?.apiKeyConfigured ?
              <p className="text-xs text-green-700 dark:text-green-400">
                Clé Mistral enregistrée — le champ reste vide volontairement (comme un mot de
                passe).
              </p>
            : null}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => void openExternalUrl("https://console.mistral.ai/")}
            >
              Obtenir une clé sur console.mistral.ai
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="param-mistral-model">Modèle</Label>
            <Input
              id="param-mistral-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MISTRAL_MODEL}
            />
          </div>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ?
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement…
              </>
            : "Enregistrer la clé Mistral"}
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Style par défaut"
        description="Équivalent de votre GEM Gemini — modifiable à chaque génération via « Instructions édition »"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {NEWSLETTER_STYLE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStylePrompt(preset.prompt)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Textarea
            rows={12}
            className="font-mono text-xs"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
          />
        </div>
      </SettingsPanel>

      <SettingsPanel title="Campagne" description="Étiquette technique pour la file d'envoi et espacement entre emails">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="param-nl-etiquette">Nom de l'étiquette (file d'envoi)</Label>
            <Input
              id="param-nl-etiquette"
              value={etiquetteNom}
              onChange={(e) => setEtiquetteNom(e.target.value)}
            />
            {subscriberCount != null && (
              <p className="text-xs text-muted-foreground">
                {subscriberCount} contact{subscriberCount !== 1 ? "s" : ""} tagué
                {subscriberCount !== 1 ? "s" : ""} manuellement (optionnel — l'audience inclut
                toute la base par défaut)
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="param-nl-delay">Délai entre envois (ms)</Label>
            <Input
              id="param-nl-delay"
              type="number"
              min={500}
              step={500}
              value={sendDelayMs}
              onChange={(e) => setSendDelayMs(Number(e.target.value) || 3000)}
            />
            <p className="text-xs text-muted-foreground">
              Espacer les envois réduit le risque spam (ex. 3000 = 3 secondes).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="param-nl-agenda-link">Lien « Prendre rendez-vous »</Label>
            {agendaLinks.length > 0 ? (
              <select
                id="param-nl-agenda-link"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={agendaLinkId || agendaLinks[0]!.id}
                onChange={(e) => setAgendaLinkId(e.target.value)}
              >
                {agendaLinks.map((link) => (
                  <option key={link.id} value={link.id}>
                    {link.label} — {link.url}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
                Aucun lien agenda. Ajoutez-en dans Paramètres → Suivi → Liens Google Agenda.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Utilisé pour le bouton RDV en fin de newsletter (distinct des liens{" "}
              {"{{lien_agenda}}"} des templates email).
            </p>
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Identité visuelle"
        description="Couleurs, typographie et mise en page — optimisées pour la lecture sur mobile"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2 bg-muted/20">
            La plupart des destinataires lisent sur téléphone. Privilégiez une taille de texte
            normale ou grande, un interlignage aéré, et vérifiez l'aperçu mobile dans le
            composer.
          </p>
          <div className="space-y-2">
            <Label htmlFor="param-nl-accent">Couleur d'accent (en-tête, titres)</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="param-nl-accent"
                type="color"
                className="w-14 h-10 p-1 cursor-pointer"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
              />
              <Input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#0f2744"
                className="font-mono text-sm max-w-[8rem]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="param-nl-secondary">Couleur secondaire (traits, numéros, CTA)</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="param-nl-secondary"
                type="color"
                className="w-14 h-10 p-1 cursor-pointer"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
              />
              <Input
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                placeholder={DEFAULT_NEWSLETTER_SECONDARY}
                className="font-mono text-sm max-w-[8rem]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="param-nl-default-layout">Mise en page par défaut</Label>
            <select
              id="param-nl-default-layout"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={defaultLayout}
              onChange={(e) => setDefaultLayout(e.target.value as NewsletterLayout)}
            >
              {NEWSLETTER_LAYOUT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {NEWSLETTER_LAYOUT_OPTIONS.find((o) => o.id === defaultLayout)?.hint}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="param-nl-body-font">Police du corps</Label>
              <select
                id="param-nl-body-font"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={bodyFont}
                onChange={(e) => setBodyFont(e.target.value as NewsletterBodyFont)}
              >
                {NEWSLETTER_BODY_FONT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="param-nl-title-font">Police des titres</Label>
              <select
                id="param-nl-title-font"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={titleFont}
                onChange={(e) => setTitleFont(e.target.value as NewsletterTitleFont)}
              >
                {NEWSLETTER_TITLE_FONT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="param-nl-font-size">Taille du texte</Label>
              <select
                id="param-nl-font-size"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={bodyFontSize}
                onChange={(e) => setBodyFontSize(e.target.value as NewsletterBodyFontSize)}
              >
                {NEWSLETTER_FONT_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="param-nl-line-height">Interlignage</Label>
              <select
                id="param-nl-line-height"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={lineHeight}
                onChange={(e) => setLineHeight(e.target.value as NewsletterLineHeight)}
              >
                {NEWSLETTER_LINE_HEIGHT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="param-nl-section-spacing">Espacement entre sections</Label>
              <select
                id="param-nl-section-spacing"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={sectionSpacing}
                onChange={(e) => setSectionSpacing(e.target.value as NewsletterSectionSpacing)}
              >
                {NEWSLETTER_SECTION_SPACING_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ?
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement…
              </>
            : "Enregistrer l'identité et la campagne"}
          </Button>
        </div>
      </SettingsPanel>

      <NewsletterAudiencePanel
        mode="settings"
        filters={audienceFilters}
        onFiltersChange={(next) => void handleAudienceFiltersChange(next)}
      />
      {savingExclusions ?
        <p className="text-xs text-muted-foreground flex items-center gap-2 -mt-4">
          <Loader2 className="h-3 w-3 animate-spin" />
          Enregistrement des exclusions…
        </p>
      : null}

      <SettingsPanel title="Bonnes pratiques anti-spam">
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>Destinataires = contacts avec email (sauf désinscrits et exclusions permanentes)</li>
          <li>Un seul lien principal (bouton agenda)</li>
          <li>Envoi via Gmail connecté (Paramètres → Email)</li>
          <li>Testez avec « M'envoyer un test » avant la campagne</li>
        </ul>
      </SettingsPanel>
    </div>
  );
}
