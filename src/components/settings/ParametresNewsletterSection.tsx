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
  listBrevoEmailTemplates,
  saveNewsletterSettings,
  testBrevoConnection,
  type BrevoTemplateSummary,
  type NewsletterAudienceFilters,
  type NewsletterSettings,
} from "@/lib/api/tauri-newsletter";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { normalizeAgendaLinks } from "@/lib/emails/agenda-links";
import { NewsletterAudiencePanel } from "@/components/newsletter/NewsletterAudiencePanel";
import { openExternalUrl } from "@/lib/api/tauri-system";
import {
  DEFAULT_NEWSLETTER_STYLE_PROMPT,
  NEWSLETTER_STYLE_PRESETS,
} from "@/lib/newsletter/default-style-prompt";
import {
  NEWSLETTER_LLM_PROVIDERS,
  newsletterLlmProviderOption,
  type NewsletterLlmProvider,
} from "@/lib/newsletter/llm-providers";
import {
  DEFAULT_NEWSLETTER_HEADER_TEXT,
  DEFAULT_NEWSLETTER_SECONDARY,
  DEFAULT_NEWSLETTER_TEXT,
  NEWSLETTER_LAYOUT_OPTIONS,
  resolveNewsletterColors,
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

function NewsletterColorField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className="flex gap-2 items-center">
        <Input
          id={id}
          type="color"
          className="w-14 h-10 p-1 cursor-pointer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="font-mono text-sm max-w-[8rem]"
        />
      </div>
    </div>
  );
}

export function ParametresNewsletterSection({
  onSettingsSync,
  switchToComposerAfterSave = false,
  onSwitchToComposer,
}: {
  /** Met à jour l'état parent (ex. liste d'exclusions côté composer) sans navigation. */
  onSettingsSync?: (settings: NewsletterSettings) => void;
  /** Uniquement après « Enregistrer » fournisseur IA / campagne (pas les exclusions). */
  switchToComposerAfterSave?: boolean;
  onSwitchToComposer?: () => void;
}) {
  const [settings, setSettings] = useState<NewsletterSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [llmProvider, setLlmProvider] = useState<NewsletterLlmProvider>("mistral");
  const llmProviderMeta = newsletterLlmProviderOption(llmProvider);
  const [brevoApiKeyInput, setBrevoApiKeyInput] = useState("");
  const [brevoSenderName, setBrevoSenderName] = useState("");
  const [brevoSenderEmail, setBrevoSenderEmail] = useState("");
  const [defaultBrevoTemplateId, setDefaultBrevoTemplateId] = useState("");
  const [brevoTemplates, setBrevoTemplates] = useState<BrevoTemplateSummary[]>([]);
  const [loadingBrevoTemplates, setLoadingBrevoTemplates] = useState(false);
  const [testingBrevo, setTestingBrevo] = useState(false);
  const [brevoTemplatesError, setBrevoTemplatesError] = useState<string | null>(null);
  const [stylePrompt, setStylePrompt] = useState(DEFAULT_NEWSLETTER_STYLE_PROMPT);
  const [model, setModel] = useState(llmProviderMeta.defaultModel);
  const [etiquetteNom, setEtiquetteNom] = useState("Newsletter");
  const [sendDelayMs, setSendDelayMs] = useState(3000);
  const [headerColor, setHeaderColor] = useState("#0f2744");
  const [headerTextColor, setHeaderTextColor] = useState(DEFAULT_NEWSLETTER_HEADER_TEXT);
  const [titleColor, setTitleColor] = useState("#0f2744");
  const [separatorColor, setSeparatorColor] = useState(DEFAULT_NEWSLETTER_SECONDARY);
  const [textColor, setTextColor] = useState(DEFAULT_NEWSLETTER_TEXT);
  const [buttonColor, setButtonColor] = useState("#0f2744");
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

  const loadBrevoTemplates = useCallback(async () => {
    setLoadingBrevoTemplates(true);
    setBrevoTemplatesError(null);
    try {
      const templates = await listBrevoEmailTemplates();
      setBrevoTemplates(templates);
      if (templates.length === 0) {
        setBrevoTemplatesError(
          "Aucun template transactionnel trouvé. Créez-le dans Brevo : Transactionnel → Templates, ou saisissez l'ID manuellement ci-dessous."
        );
      }
    } catch (e) {
      setBrevoTemplates([]);
      const message = e instanceof Error ? e.message : String(e);
      setBrevoTemplatesError(message);
      toast.error(message);
    } finally {
      setLoadingBrevoTemplates(false);
    }
  }, []);

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
      setLlmProvider(
        (newsletterLlmProviderOption(s.llmProvider).id as NewsletterLlmProvider) ?? "mistral"
      );
      setStylePrompt(s.stylePrompt);
      setModel(s.model);
      setEtiquetteNom(s.etiquetteNom);
      setSendDelayMs(s.sendDelayMs);
      const colors = resolveNewsletterColors({
        accentColor: s.accentColor,
        secondaryColor: s.secondaryColor,
        headerColor: s.headerColor,
        headerTextColor: s.headerTextColor,
        titleColor: s.titleColor,
        separatorColor: s.separatorColor,
        textColor: s.textColor,
        buttonColor: s.buttonColor,
      });
      setHeaderColor(colors.headerColor);
      setHeaderTextColor(colors.headerTextColor);
      setTitleColor(colors.titleColor);
      setSeparatorColor(colors.separatorColor);
      setTextColor(colors.textColor);
      setButtonColor(colors.buttonColor);
      setDefaultLayout(s.defaultLayout ?? "magazine");
      setBodyFont(s.bodyFont ?? "classic");
      setTitleFont(s.titleFont ?? "classic");
      setBodyFontSize(s.bodyFontSize ?? "md");
      setLineHeight(s.lineHeight ?? "relaxed");
      setSectionSpacing(s.sectionSpacing ?? "normal");
      setAudienceFilters(s.defaultAudienceFilters ?? DEFAULT_NEWSLETTER_AUDIENCE_FILTERS);
      setAgendaLinkId(s.agendaLinkId?.trim() || links[0]?.id || "");
      setBrevoSenderName(s.brevoSenderName?.trim() || cgpConfig?.nom?.trim() || "");
      setBrevoSenderEmail(s.brevoSenderEmail?.trim() || cgpConfig?.email?.trim() || "");
      setDefaultBrevoTemplateId(
        s.defaultBrevoTemplateId != null ? String(s.defaultBrevoTemplateId) : ""
      );
      if (s.brevoApiKeyConfigured) {
        void loadBrevoTemplates();
      } else {
        setBrevoTemplates([]);
      }
      const etiq = await ensureNewsletterEtiquette(s.etiquetteNom);
      setSubscriberCount(etiq.contactCount);
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger les paramètres newsletter");
    } finally {
      setLoading(false);
    }
  }, [loadBrevoTemplates]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (options?: { requireLlmApiKey?: boolean }) => {
    const requireLlmApiKey = options?.requireLlmApiKey ?? false;
    const savedLlmProvider = settings
      ? (newsletterLlmProviderOption(settings.llmProvider).id as NewsletterLlmProvider)
      : null;
    const providerChanged =
      savedLlmProvider != null && llmProvider !== savedLlmProvider;
    if (requireLlmApiKey && !settings?.apiKeyConfigured && !apiKeyInput.trim()) {
      toast.error(`Saisissez votre clé API ${llmProviderMeta.label} avant d'enregistrer`);
      return;
    }
    if (providerChanged && !apiKeyInput.trim()) {
      toast.error(
        `Vous avez sélectionné ${llmProviderMeta.label} : saisissez la clé API correspondante avant d'enregistrer.`
      );
      return;
    }
    setSaving(true);
    try {
      const payload: Parameters<typeof saveNewsletterSettings>[0] = {
        llmProvider,
        stylePrompt,
        model,
        etiquetteNom,
        sendDelayMs,
        accentColor: buttonColor,
        secondaryColor: separatorColor,
        headerColor,
        headerTextColor,
        titleColor,
        separatorColor,
        textColor,
        buttonColor,
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
        toast.success(`Clé ${llmProviderMeta.label} enregistrée (masquée pour sécurité)`);
      } else {
        toast.success("Paramètres newsletter enregistrés");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleTestBrevo = async () => {
    setTestingBrevo(true);
    try {
      const message = await testBrevoConnection();
      toast.success(message);
      await loadBrevoTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connexion Brevo impossible");
    } finally {
      setTestingBrevo(false);
    }
  };

  const handleSaveBrevo = async () => {
    if (!settings?.brevoApiKeyConfigured && !brevoApiKeyInput.trim()) {
      toast.error("Saisissez votre clé API Brevo avant d'enregistrer");
      return;
    }
    setSaving(true);
    try {
      const payload: Parameters<typeof saveNewsletterSettings>[0] = {
        brevoSenderName: brevoSenderName.trim() || null,
        brevoSenderEmail: brevoSenderEmail.trim() || null,
        defaultBrevoTemplateId:
          defaultBrevoTemplateId.trim() ? Number(defaultBrevoTemplateId) : null,
      };
      if (brevoApiKeyInput.trim()) {
        payload.brevoApiKey = brevoApiKeyInput.trim();
      }
      const saved = await saveNewsletterSettings(payload);
      setSettings(saved);
      setBrevoApiKeyInput("");
      onSettingsSync?.(saved);
      if (payload.brevoApiKey) {
        toast.success("Clé Brevo enregistrée (masquée pour sécurité)");
      } else {
        toast.success("Paramètres Brevo enregistrés");
      }
      void loadBrevoTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur enregistrement Brevo");
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
        id="newsletter-llm"
        title="Fournisseur IA (newsletter)"
        description="Un seul fournisseur actif à la fois. Clé chiffrée localement. Les bulletins SCPI restent sur Mistral (OCR)."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="param-llm-provider">Fournisseur</Label>
            <select
              id="param-llm-provider"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={llmProvider}
              onChange={(e) => {
                const next = e.target.value as NewsletterLlmProvider;
                setLlmProvider(next);
                const meta = newsletterLlmProviderOption(next);
                if (
                  model.trim() === "" ||
                  NEWSLETTER_LLM_PROVIDERS.some((item) => item.defaultModel === model.trim())
                ) {
                  setModel(meta.defaultModel);
                }
              }}
            >
              {NEWSLETTER_LLM_PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="param-llm-key">
              {settings?.apiKeyConfigured ?
                `Nouvelle clé ${llmProviderMeta.label} (laisser vide pour conserver)`
              : `Clé API ${llmProviderMeta.label}`}
            </Label>
            <Input
              id="param-llm-key"
              type="password"
              autoComplete="off"
              placeholder={
                settings?.apiKeyConfigured ? "••••••••" : llmProviderMeta.keyPlaceholder
              }
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            {settings?.apiKeyConfigured ?
              <p className="text-xs text-green-700 dark:text-green-400">
                Clé {newsletterLlmProviderOption(settings.llmProvider).label} enregistrée — le
                champ reste vide volontairement (comme un mot de passe).
              </p>
            : null}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => void openExternalUrl(llmProviderMeta.keyUrl)}
            >
              Obtenir une clé {llmProviderMeta.label}
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="param-llm-model">Modèle</Label>
            <Input
              id="param-llm-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={llmProviderMeta.defaultModel}
            />
            <p className="text-xs text-muted-foreground">
              Suggestion : <code className="text-[11px]">{llmProviderMeta.defaultModel}</code>
            </p>
          </div>
          <Button type="button" disabled={saving} onClick={() => void handleSave({ requireLlmApiKey: true })}>
            {saving ?
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement…
              </>
            : "Enregistrer le fournisseur IA"}
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel
        id="newsletter-brevo"
        title="Brevo (envoi professionnel)"
        description="Clé API, expéditeur et template par défaut. Le premier push amorce un brouillon Brevo avec le texte du CRM — personnalisez ensuite librement dans Brevo."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="param-brevo-key">
              {settings?.brevoApiKeyConfigured ?
                "Nouvelle clé API (laisser vide pour conserver)"
              : "Clé API Brevo"}
            </Label>
            <Input
              id="param-brevo-key"
              type="password"
              autoComplete="off"
              placeholder={settings?.brevoApiKeyConfigured ? "••••••••" : "xkeysib-…"}
              value={brevoApiKeyInput}
              onChange={(e) => setBrevoApiKeyInput(e.target.value)}
            />
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => void openExternalUrl("https://app.brevo.com/settings/keys/api")}
            >
              Gérer les clés sur app.brevo.com
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="param-brevo-sender-name">Nom expéditeur</Label>
              <Input
                id="param-brevo-sender-name"
                value={brevoSenderName}
                onChange={(e) => setBrevoSenderName(e.target.value)}
                placeholder="Votre cabinet"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="param-brevo-sender-email">Email expéditeur</Label>
              <Input
                id="param-brevo-sender-email"
                type="email"
                value={brevoSenderEmail}
                onChange={(e) => setBrevoSenderEmail(e.target.value)}
                placeholder="newsletter@example.com"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label htmlFor="param-brevo-template">Template par défaut</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!settings?.brevoApiKeyConfigured || loadingBrevoTemplates}
                onClick={() => void loadBrevoTemplates()}
              >
                {loadingBrevoTemplates ?
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : "Actualiser"}
              </Button>
            </div>
            <select
              id="param-brevo-template"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={defaultBrevoTemplateId}
              onChange={(e) => setDefaultBrevoTemplateId(e.target.value)}
              disabled={!settings?.brevoApiKeyConfigured || brevoTemplates.length === 0}
            >
              <option value="">— Choisir un template —</option>
              {brevoTemplates.map((template) => (
                <option key={template.id} value={String(template.id)}>
                  {template.name}
                  {template.subject ? ` — ${template.subject}` : ""}
                  {!template.isActive ? " (inactif)" : ""}
                </option>
              ))}
            </select>
            <div className="space-y-2">
              <Label htmlFor="param-brevo-template-id">Ou ID template (nombre)</Label>
              <Input
                id="param-brevo-template-id"
                type="number"
                min={1}
                placeholder="Ex. 42 — visible dans l'URL Brevo lors de l'édition"
                value={defaultBrevoTemplateId}
                onChange={(e) => setDefaultBrevoTemplateId(e.target.value)}
              />
            </div>
            {brevoTemplatesError ?
              <p className="text-xs text-amber-700 dark:text-amber-400">{brevoTemplatesError}</p>
            : null}
            <p className="text-xs text-muted-foreground">
              Template <strong>Transactionnel → Templates</strong> (actif), choisi une fois comme
              modèle de mise en page (ex. <code className="text-[11px]">{"{{ contact.FIRSTNAME }}"}</code>
              ). Le texte de chaque newsletter se colle dans le <strong>brouillon campagne</strong>{" "}
              (Modifier le design), pas ici.
            </p>
          </div>
          <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Exemple de structure template (une fois)</p>
            <pre className="text-[11px] whitespace-pre-wrap bg-muted/30 rounded p-2">{`<p>Bonjour {{ contact.FIRSTNAME }},</p>
<p>… zone de corps éditable dans le brouillon …</p>`}</pre>
            <p>
              Après chaque push CRM : Marketing → Campagnes → Brouillons → « CRM — … » →{" "}
              <strong>Modifier le design</strong> → coller le texte du compositeur → envoyer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!settings?.brevoApiKeyConfigured || testingBrevo}
              onClick={() => void handleTestBrevo()}
            >
              {testingBrevo ?
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : null}
              Tester la connexion
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSaveBrevo()}>
              {saving ?
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement…
                </>
              : "Enregistrer Brevo"}
            </Button>
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Style de rédaction"
        description="Prompt système envoyé au fournisseur IA choisi (Mistral, GPT, Claude ou Gemini)."
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
                Aucun lien agenda. Ajoutez-en dans Paramètres → Agenda & RDV.
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
          <div className="grid gap-4 sm:grid-cols-2">
            <NewsletterColorField
              id="param-nl-header-color"
              label="Couleur en-tête"
              hint="Fond du bandeau (logo et textes d'en-tête)."
              value={headerColor}
              onChange={setHeaderColor}
              placeholder="#0f2744"
            />
            <NewsletterColorField
              id="param-nl-header-text-color"
              label="Couleur texte en-tête"
              hint="« Lettre patrimoniale », mois (ex. août 2026), nom du cabinet."
              value={headerTextColor}
              onChange={setHeaderTextColor}
              placeholder={DEFAULT_NEWSLETTER_HEADER_TEXT}
            />
            <NewsletterColorField
              id="param-nl-title-color"
              label="Couleur titres"
              hint="Titres de section et libellés mis en avant."
              value={titleColor}
              onChange={setTitleColor}
              placeholder="#0f2744"
            />
            <NewsletterColorField
              id="param-nl-separator-color"
              label="Couleur séparateur"
              hint="Trait sous l'en-tête, numéros de section, filets."
              value={separatorColor}
              onChange={setSeparatorColor}
              placeholder={DEFAULT_NEWSLETTER_SECONDARY}
            />
            <NewsletterColorField
              id="param-nl-text-color"
              label="Couleur du texte"
              hint="Intro, corps des sections et encarts."
              value={textColor}
              onChange={setTextColor}
              placeholder={DEFAULT_NEWSLETTER_TEXT}
            />
            <NewsletterColorField
              id="param-nl-button-color"
              label="Couleur bouton"
              hint="Boutons d'action (RDV, CTA cliquable)."
              value={buttonColor}
              onChange={setButtonColor}
              placeholder="#0f2744"
            />
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
          <Button type="button" disabled={saving} onClick={() => void handleSave({ requireLlmApiKey: false })}>
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
          <li>Envoi Gmail : connectez Gmail (Paramètres → Emails & envois)</li>
          <li>Envoi Brevo : préparez la campagne puis « Pousser vers Brevo »</li>
          <li>Testez avec « M'envoyer un test » avant la campagne Gmail</li>
        </ul>
      </SettingsPanel>
    </div>
  );
}
