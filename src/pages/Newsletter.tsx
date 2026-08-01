import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Send,
  Settings2,
  Loader2,
  ArrowRight,
  Eye,
  Save,
  Mail,
  Copy,
  Undo2,
  ExternalLink,
} from "lucide-react";
import {
  DEFAULT_NEWSLETTER_AUDIENCE_FILTERS,
  ensureNewsletterEtiquette,
  generateNewsletterContent,
  cancelNewsletterPreparation,
  getLastNewsletterEditionDuplicate,
  getNewsletterEditionDetail,
  getNewsletterSettings,
  listBrevoEmailTemplates,
  listNewsletterEditions,
  prepareNewsletterEdition,
  pushNewsletterEditionToBrevo,
  type BrevoTemplateSummary,
  type NewsletterEditionDetail,
  type NewsletterEditionSummary,
  type GeneratedNewsletterContent,
  type NewsletterAudienceFilters,
  type NewsletterAudiencePreview,
  type NewsletterChatTurn,
  type NewsletterSettings,
} from "@/lib/api/tauri-newsletter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { sendEmail } from "@/lib/api/tauri-email";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { openExternalUrl } from "@/lib/api/tauri-system";
import { ParametresNewsletterSection } from "@/components/settings/ParametresNewsletterSection";
import { appendEmailSignature, buildSendEmailBodies } from "@/lib/emails/email-signature";
import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";
import {
  buildNewsletterHtml,
  buildNewsletterHtmlOptions,
  buildNewsletterPlainBody,
  defaultConseillerFields,
  draftFromStructuredContent,
  mergeNewsletterDraftFromPlain,
  formatNewsletterEditionLabel,
  injectNewsletterSignatureHtml,
  serializeNewsletterTemplateMeta,
} from "@/lib/newsletter/newsletter-html";
import { buildNewsletterTemplateVariables } from "@/lib/newsletter/newsletter-template-variables";
import {
  NEWSLETTER_STRUCTURE_PRESETS,
  structureInstructionsForPreset,
} from "@/lib/newsletter/newsletter-structure-presets";
import { footerProfileFromCgp } from "@/lib/newsletter/newsletter-footer-options";
import type { NewsletterEditMode } from "@/lib/newsletter/newsletter-composer-draft";
import { NewsletterHtmlPreviewFrame } from "@/components/newsletter/NewsletterHtmlPreviewFrame";
import { NewsletterInboxPreview } from "@/components/newsletter/NewsletterInboxPreview";
import { NewsletterSectionEditor } from "@/components/newsletter/NewsletterSectionEditor";
import { loadCgpLogoDataUrl } from "@/lib/settings/cgp-logo-preview";
import { NewsletterChatPanel } from "@/components/newsletter/NewsletterChatPanel";
import {
  NewsletterAudiencePanel,
  newsletterChecklistOk,
} from "@/components/newsletter/NewsletterAudiencePanel";
import { NewsletterHistoryPanel } from "@/components/newsletter/NewsletterHistoryPanel";
import {
  countNewsletterReady,
  sendNewsletterBatch,
} from "@/lib/newsletter/newsletter-batch-send";
import {
  loadNewsletterComposerDraft,
  saveNewsletterComposerDraft,
} from "@/lib/newsletter/newsletter-composer-draft";
import { newsletterLlmProviderOption } from "@/lib/newsletter/llm-providers";
import { buildComposerRestoreFromEdition } from "@/lib/newsletter/newsletter-composer-restore";
import { isResumableNewsletterEdition } from "@/lib/newsletter/newsletter-edition-resume";
import { hasNewsletterAudienceDrift } from "@/lib/newsletter/newsletter-audience-utils";
import { beginBackgroundActivity } from "@/lib/background-activity";
import { toast } from "sonner";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { CRM_NEWSLETTER_TAB_KEY } from "@/lib/navigation/app-navigation";

function buildHtmlOptions(
  cgp: CgpConfig | null,
  logoDataUrl: string | null,
  content: GeneratedNewsletterContent | null,
  settings: NewsletterSettings | null
) {
  return {
    ...buildNewsletterHtmlOptions(cgp, {
      accentColor: settings?.accentColor,
      secondaryColor: settings?.secondaryColor,
      layout: content?.layout ?? settings?.defaultLayout ?? undefined,
      agendaLinkId: settings?.agendaLinkId,
      typography: {
        bodyFont: settings?.bodyFont,
        titleFont: settings?.titleFont,
        bodyFontSize: settings?.bodyFontSize,
        lineHeight: settings?.lineHeight,
        sectionSpacing: settings?.sectionSpacing,
      },
    }),
    logoDataUrl: logoDataUrl ?? undefined,
    editionLabel: formatNewsletterEditionLabel(),
    preheader: content?.preheader?.trim() || undefined,
  };
}

function resetComposerState(): {
  theme: string;
  editionInstructions: string;
  structurePresetId: string;
  editMode: NewsletterEditMode;
  content: GeneratedNewsletterContent | null;
  subject: string;
  plainBody: string;
  previewHtml: string;
  chatHistory: NewsletterChatTurn[];
  chatSessionKey: number;
} {
  return {
    theme: "",
    editionInstructions: "",
    structurePresetId: "libre",
    editMode: "plain",
    content: null,
    subject: "",
    plainBody: "",
    previewHtml: "",
    chatHistory: [],
    chatSessionKey: 0,
  };
}

export function Newsletter({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const restoredDraftRef = useRef(loadNewsletterComposerDraft());
  const restoredDraft = restoredDraftRef.current;
  const draftPersistReady = useRef(false);
  const draftRestoreNotified = useRef(false);

  const [tab, setTab] = useState<"composer" | "settings">(restoredDraft?.tab ?? "composer");
  const [settings, setSettings] = useState<NewsletterSettings | null>(null);
  const [cgp, setCgp] = useState<CgpConfig | null>(null);
  const [emailConnected, setEmailConnected] = useState(false);

  const [theme, setTheme] = useState(restoredDraft?.theme ?? "");
  const [editionInstructions, setEditionInstructions] = useState(
    restoredDraft?.editionInstructions ?? ""
  );
  const [structurePresetId, setStructurePresetId] = useState(
    restoredDraft?.structurePresetId ?? "libre"
  );
  const [editMode, setEditMode] = useState<NewsletterEditMode>(
    restoredDraft?.editMode ?? "plain"
  );
  const [generating, setGenerating] = useState(false);
  const [content, setContent] = useState<GeneratedNewsletterContent | null>(
    restoredDraft?.content ?? null
  );
  const [subject, setSubject] = useState(restoredDraft?.subject ?? "");
  const [plainBody, setPlainBody] = useState(restoredDraft?.plainBody ?? "");
  const [previewHtml, setPreviewHtml] = useState(restoredDraft?.previewHtml ?? "");

  const [preparing, setPreparing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const [etiquetteInfo, setEtiquetteInfo] = useState<{
    id: number;
  } | null>(null);
  const [sendDelayMs, setSendDelayMs] = useState(3000);
  const [chatHistory, setChatHistory] = useState<NewsletterChatTurn[]>(
    restoredDraft?.chatHistory ?? []
  );
  const [chatSessionKey, setChatSessionKey] = useState(restoredDraft?.chatSessionKey ?? 0);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [audienceFilters, setAudienceFilters] = useState<NewsletterAudienceFilters>(
    restoredDraft?.audienceFilters ?? DEFAULT_NEWSLETTER_AUDIENCE_FILTERS
  );
  const [preparedQueueCount, setPreparedQueueCount] = useState<number | null>(
    restoredDraft?.preparedQueueCount ?? null
  );
  const [preparedEditionQueuedCount, setPreparedEditionQueuedCount] = useState<number | null>(null);
  const [preparedRecipientContactIds, setPreparedRecipientContactIds] = useState<number[] | null>(
    null
  );
  const [activeEditionId, setActiveEditionId] = useState<number | null>(
    restoredDraft?.activeEditionId ?? null
  );
  const activeEditionIdRef = useRef(activeEditionId);
  activeEditionIdRef.current = activeEditionId;
  const [batchSending, setBatchSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ sent: number; total: number } | null>(
    null
  );
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [cancelPrepareConfirmOpen, setCancelPrepareConfirmOpen] = useState(false);
  const [cancellingPreparation, setCancellingPreparation] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [historyExpandEditionId, setHistoryExpandEditionId] = useState<number | null>(null);
  const [preparedReviewOpen, setPreparedReviewOpen] = useState(false);
  const [preparedEditionDetail, setPreparedEditionDetail] =
    useState<NewsletterEditionDetail | null>(null);
  const [loadingPreparedReview, setLoadingPreparedReview] = useState(false);
  const batchAbortRef = useRef<AbortController | null>(null);
  const [audiencePreview, setAudiencePreview] = useState<NewsletterAudiencePreview | null>(null);
  const [resumingEditionId, setResumingEditionId] = useState<number | null>(null);
  const [brevoTemplates, setBrevoTemplates] = useState<BrevoTemplateSummary[]>([]);
  const [selectedBrevoTemplateId, setSelectedBrevoTemplateId] = useState("");
  const [loadingBrevoTemplates, setLoadingBrevoTemplates] = useState(false);
  const [brevoPushing, setBrevoPushing] = useState(false);
  const [brevoCampaignListUrl, setBrevoCampaignListUrl] = useState<string | null>(null);
  const [brevoCampaignName, setBrevoCampaignName] = useState<string | null>(null);
  const [composerEditionId, setComposerEditionId] = useState<number | null>(
    restoredDraft?.composerEditionId ?? restoredDraft?.activeEditionId ?? null
  );
  const [generateWhilePreparedConfirmOpen, setGenerateWhilePreparedConfirmOpen] = useState(false);
  const [brevoRepushConfirmOpen, setBrevoRepushConfirmOpen] = useState(false);
  const [activeEditionBrevoCampaignId, setActiveEditionBrevoCampaignId] = useState<number | null>(
    null
  );

  const { openContactSheet, sheet: contactDetailSheet } = useContactDetailSheet({ onNavigate });

  const audienceContactIds = useMemo(
    () => audiencePreview?.recipients.map((r) => r.contactId).filter((id) => id > 0) ?? [],
    [audiencePreview]
  );

  const audienceDrift = useMemo(
    () => hasNewsletterAudienceDrift(audiencePreview, preparedRecipientContactIds),
    [audiencePreview, preparedRecipientContactIds]
  );

  const hasActivePreparedCampaign =
    activeEditionId != null && (preparedEditionQueuedCount ?? 0) > 0;

  const applyPreparedEditionSnapshot = useCallback((detail: NewsletterEditionDetail) => {
    setPreparedEditionQueuedCount(detail.queuedCount);
    setPreparedRecipientContactIds(detail.recipients.map((recipient) => recipient.contactId));
    setActiveEditionBrevoCampaignId(detail.brevoCampaignId ?? null);
    if (detail.brevoCampaignId != null) {
      setBrevoCampaignName(`CRM — ${detail.editionLabel}`);
    }
  }, []);

  const loadPreparedEditionSnapshot = useCallback(
    async (editionId: number) => {
      const detail = await getNewsletterEditionDetail(editionId);
      applyPreparedEditionSnapshot(detail);
      return detail;
    },
    [applyPreparedEditionSnapshot]
  );

  const clearPreparedEditionSnapshot = useCallback(() => {
    setPreparedEditionQueuedCount(null);
    setPreparedRecipientContactIds(null);
    setActiveEditionBrevoCampaignId(null);
    setBrevoCampaignListUrl(null);
    setBrevoCampaignName(null);
  }, []);

  const load = useCallback(async () => {
    const [s, cgpConfig, emailSt] = await Promise.all([
      getNewsletterSettings(),
      getCgpConfig().catch(() => null),
      getEmailConnectionStatus().catch(() => null),
    ]);
    setSettings(s);
    setSendDelayMs(s.sendDelayMs);
    setSelectedBrevoTemplateId(
      s.defaultBrevoTemplateId != null ? String(s.defaultBrevoTemplateId) : ""
    );
    setCgp(cgpConfig);
    setEmailConnected(Boolean(emailSt?.connected && emailSt.method === "oauth"));
    const etiq = await ensureNewsletterEtiquette(s.etiquetteNom);
    setEtiquetteInfo({ id: etiq.etiquetteId });
    const editions = await listNewsletterEditions(15);
    const resumableEditions = editions.filter(isResumableNewsletterEdition);
    const resumable = resumableEditions[0] ?? null;
    const currentActiveId = activeEditionIdRef.current;
    const storedStillSendable =
      currentActiveId != null &&
      resumableEditions.some((edition) => edition.id === currentActiveId);
    const editionId = storedStillSendable ? currentActiveId : (resumable?.id ?? null);
    if (editionId != null && editionId !== currentActiveId) {
      setActiveEditionId(editionId);
    }
    if (editionId != null) {
      const [ready, detail] = await Promise.all([
        countNewsletterReady(etiq.etiquetteId, editionId),
        getNewsletterEditionDetail(editionId),
      ]);
      setPreparedEditionQueuedCount(detail.queuedCount);
      setPreparedRecipientContactIds(detail.recipients.map((recipient) => recipient.contactId));
      setActiveEditionBrevoCampaignId(detail.brevoCampaignId ?? null);
      if (detail.brevoCampaignId != null) {
        setBrevoCampaignName(`CRM — ${detail.editionLabel}`);
      }
      setPreparedQueueCount(ready > 0 ? ready : null);
    } else if (!storedStillSendable && resumable == null) {
      setPreparedQueueCount(null);
      setPreparedEditionQueuedCount(null);
      setPreparedRecipientContactIds(null);
      setActiveEditionId(null);
      setActiveEditionBrevoCampaignId(null);
    }
  }, []);

  useEffect(() => {
    const storedTab = sessionStorage.getItem(CRM_NEWSLETTER_TAB_KEY);
    sessionStorage.removeItem(CRM_NEWSLETTER_TAB_KEY);
    if (storedTab === "settings") {
      setTab("settings");
    }
  }, []);

  useEffect(() => {
    void load().catch((e) => {
      console.error(e);
      toast.error("Impossible de charger la newsletter");
    });
  }, [load]);

  const loadBrevoTemplates = useCallback(async () => {
    if (!settings?.brevoApiKeyConfigured) {
      setBrevoTemplates([]);
      return;
    }
    setLoadingBrevoTemplates(true);
    try {
      const templates = await listBrevoEmailTemplates();
      setBrevoTemplates(templates);
    } catch (e) {
      setBrevoTemplates([]);
      toast.error(e instanceof Error ? e.message : "Impossible de charger les templates Brevo");
    } finally {
      setLoadingBrevoTemplates(false);
    }
  }, [settings?.brevoApiKeyConfigured]);

  useEffect(() => {
    if (settings?.brevoApiKeyConfigured && hasActivePreparedCampaign) {
      void loadBrevoTemplates();
    }
  }, [settings?.brevoApiKeyConfigured, hasActivePreparedCampaign, loadBrevoTemplates]);

  useEffect(() => {
    if (activeEditionId == null) {
      setBrevoCampaignListUrl(null);
      setBrevoCampaignName(null);
      setActiveEditionBrevoCampaignId(null);
      return;
    }
    void listNewsletterEditions(15)
      .then((editions) => {
        const edition = editions.find((item) => item.id === activeEditionId);
        if (edition?.brevoCampaignId) {
          setActiveEditionBrevoCampaignId(edition.brevoCampaignId);
          setBrevoCampaignListUrl("https://app.brevo.com/campaigns/listing/email");
          setBrevoCampaignName(`CRM — ${edition.editionLabel}`);
        } else {
          setActiveEditionBrevoCampaignId(null);
          setBrevoCampaignListUrl(null);
          setBrevoCampaignName(null);
        }
      })
      .catch(() => {
        setActiveEditionBrevoCampaignId(null);
        setBrevoCampaignListUrl(null);
        setBrevoCampaignName(null);
      });
  }, [activeEditionId, historyRefreshKey]);

  useEffect(() => {
    draftPersistReady.current = true;
    if (
      !draftRestoreNotified.current &&
      restoredDraft &&
      (restoredDraft.plainBody.trim() ||
        restoredDraft.theme.trim() ||
        restoredDraft.chatHistory.length > 0 ||
        restoredDraft.audienceFilters.excludeContactIds.length > 0 ||
        restoredDraft.preparedQueueCount != null)
    ) {
      draftRestoreNotified.current = true;
      toast.info("Brouillon newsletter restauré");
    }
  }, [restoredDraft]);

  useEffect(() => {
    if (tab !== "composer") return;
    void getNewsletterSettings()
      .then(setSettings)
      .catch(() => {});
  }, [tab]);

  useEffect(() => {
    void loadCgpLogoDataUrl(cgp?.logo_path).then(setLogoDataUrl);
  }, [cgp?.logo_path]);

  const currentDraft = useMemo((): GeneratedNewsletterContent => {
    if (editMode === "sections" && content) {
      return draftFromStructuredContent(subject, content);
    }
    return mergeNewsletterDraftFromPlain(subject, plainBody, content);
  }, [editMode, content, subject, plainBody]);

  const templateVariables = useMemo(
    () => buildNewsletterTemplateVariables(cgp),
    [cgp]
  );

  const conseillerDefaults = useMemo(() => {
    const fields = defaultConseillerFields(cgp);
    return { name: fields.conseillerName, phone: fields.conseillerPhone };
  }, [cgp]);

  const footerProfile = useMemo(() => footerProfileFromCgp(cgp), [cgp]);

  const htmlOptions = useMemo(
    () => buildHtmlOptions(cgp, logoDataUrl, currentDraft, settings),
    [cgp, logoDataUrl, currentDraft, settings]
  );

  const refreshPreviewHtml = useCallback(
    (c: GeneratedNewsletterContent) => {
      setPreviewHtml(buildNewsletterHtml(c, htmlOptions));
    },
    [htmlOptions]
  );

  useEffect(() => {
    if (!draftPersistReady.current) return;
    saveNewsletterComposerDraft({
      tab,
      theme,
      editionInstructions,
      structurePresetId,
      editMode,
      content,
      subject,
      plainBody,
      previewHtml,
      chatHistory,
      chatSessionKey,
      audienceFilters,
      activeEditionId,
      preparedQueueCount,
      composerEditionId,
    });
  }, [
    tab,
    theme,
    editionInstructions,
    structurePresetId,
    editMode,
    content,
    subject,
    plainBody,
    previewHtml,
    chatHistory,
    chatSessionKey,
    audienceFilters,
    activeEditionId,
    preparedQueueCount,
    composerEditionId,
  ]);

  useEffect(() => {
    if (!plainBody.trim()) return;
    setPreviewHtml(buildNewsletterHtml(currentDraft, htmlOptions));
  }, [currentDraft, htmlOptions, plainBody]);

  const applyDraft = useCallback(
    (c: GeneratedNewsletterContent) => {
      setContent(c);
      setSubject(c.subject);
      setPlainBody(buildNewsletterPlainBody(c));
      setEditMode("sections");
      refreshPreviewHtml(c);
    },
    [refreshPreviewHtml]
  );

  const handleGenerate = async () => {
    if (!theme.trim()) {
      toast.error("Indiquez un sujet ou thème");
      return;
    }
    if (preparedEditionQueuedCount != null && preparedEditionQueuedCount > 0) {
      setGenerateWhilePreparedConfirmOpen(true);
      return;
    }
    await runGenerate();
  };

  const runGenerate = async () => {
    setGenerateWhilePreparedConfirmOpen(false);
    if (!theme.trim()) {
      return;
    }
    setGenerating(true);
    try {
      const structureHint = structureInstructionsForPreset(structurePresetId);
      const mergedInstructions = [editionInstructions.trim(), structureHint]
        .filter(Boolean)
        .join("\n\n");
      const generated = await generateNewsletterContent({
        theme: theme.trim(),
        editionInstructions: mergedInstructions || null,
      });
      const conseiller = defaultConseillerFields(cgp);
      const withDefaults = {
        ...generated,
        includeCta: generated.includeCta ?? Boolean(generated.cta?.trim()),
        layout: generated.layout ?? settings?.defaultLayout ?? "magazine",
        includeConseiller: generated.includeConseiller ?? conseiller.includeConseiller,
        conseillerName: generated.conseillerName ?? conseiller.conseillerName,
        conseillerPhone: generated.conseillerPhone ?? conseiller.conseillerPhone,
      };
      setContent(withDefaults);
      setSubject(withDefaults.subject);
      const plain = buildNewsletterPlainBody(withDefaults);
      setPlainBody(plain);
      setEditMode("sections");
      refreshPreviewHtml(withDefaults);
      setChatHistory([]);
      setChatSessionKey((k) => k + 1);
      // Garder le lien avec l'édition préparée : le push Brevo reprend le compositeur.
      if (activeEditionId != null && hasActivePreparedCampaign) {
        setComposerEditionId(activeEditionId);
      } else {
        setComposerEditionId(null);
      }
      toast.success("Newsletter générée — discutez avec l'IA pour affiner");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de génération IA");
    } finally {
      setGenerating(false);
    }
  };

  const handlePlainBodyChange = (value: string) => {
    setPlainBody(value);
    setEditMode("plain");
  };

  const handleSectionDraftChange = (next: GeneratedNewsletterContent) => {
    setContent(next);
    setPlainBody(buildNewsletterPlainBody(next));
    setEditMode("sections");
  };

  const openPreparedReview = async (editionId: number) => {
    setLoadingPreparedReview(true);
    setPreparedReviewOpen(true);
    try {
      const detail = await getNewsletterEditionDetail(editionId);
      setPreparedEditionDetail(detail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de charger l'édition");
      setPreparedReviewOpen(false);
    } finally {
      setLoadingPreparedReview(false);
    }
  };

  const handleSendTest = async () => {
    const to = cgp?.email?.trim();
    if (!to) {
      toast.error("Renseignez votre email dans Paramètres → Profil");
      return;
    }
    if (!emailConnected) {
      toast.error("Connectez Gmail dans Paramètres → Emails & envois → Connexion");
      return;
    }
    if (!subject.trim() || !plainBody.trim()) {
      toast.error("Générez ou saisissez une newsletter d'abord");
      return;
    }
    setSendingTest(true);
    try {
      const vars = buildNewsletterTemplateVariables(cgp, {
        prenom: cgp?.prenom,
        nom: cgp?.nom,
        email: cgp?.email,
      });
      const subj = replaceTemplateVariables(subject.trim(), vars);
      const bodyPlain = appendEmailSignature(
        replaceTemplateVariables(plainBody.trim(), vars),
        cgp?.email_signature
      );
      const htmlBuilt = buildNewsletterHtml(currentDraft, htmlOptions);
      let html = replaceTemplateVariables(htmlBuilt, vars);
      html = injectNewsletterSignatureHtml(html, cgp?.email_signature_html);
      const fallback = buildSendEmailBodies(bodyPlain, cgp);
      await sendEmail({
        to_email: to,
        to_name: `${cgp?.prenom ?? ""} ${cgp?.nom ?? ""}`.trim(),
        subject: subj,
        body: bodyPlain,
        body_html: html || fallback.body_html,
      });
      toast.success(`Aperçu envoyé à ${to}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi test impossible");
    } finally {
      setSendingTest(false);
    }
  };

  const applyComposerRestore = useCallback(
    (restore: ReturnType<typeof buildComposerRestoreFromEdition>) => {
      setTheme(restore.theme);
      setEditionInstructions(restore.editionInstructions);
      setContent(restore.content);
      setSubject(restore.subject);
      setPlainBody(restore.plainBody);
      setEditMode(restore.editMode);
      setAudienceFilters(restore.audienceFilters);
      setChatHistory([]);
      setChatSessionKey((k) => k + 1);
      if (restore.content || restore.plainBody.trim()) {
        const draft =
          restore.editMode === "sections" && restore.content
            ? draftFromStructuredContent(restore.subject, restore.content)
            : mergeNewsletterDraftFromPlain(
                restore.subject,
                restore.plainBody,
                restore.content
              );
        refreshPreviewHtml(draft);
      } else {
        setPreviewHtml("");
      }
    },
    [refreshPreviewHtml]
  );

  const handleDuplicateLastEdition = async () => {
    setDuplicating(true);
    try {
      const last = await getLastNewsletterEditionDuplicate();
      if (!last) {
        toast.error("Aucune édition précédente à dupliquer");
        return;
      }
      applyComposerRestore(
        buildComposerRestoreFromEdition(
          last,
          settings?.defaultAudienceFilters ?? DEFAULT_NEWSLETTER_AUDIENCE_FILTERS
        )
      );
      setComposerEditionId(null);
      toast.success(`Édition « ${last.editionLabel} » dupliquée — adaptez puis préparez`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Duplication impossible");
    } finally {
      setDuplicating(false);
    }
  };

  const handleCancelPreparation = async () => {
    if (!etiquetteInfo) {
      toast.error("Étiquette Newsletter introuvable");
      return;
    }
    setCancellingPreparation(true);
    try {
      const result = await cancelNewsletterPreparation({
        etiquetteId: etiquetteInfo.id,
        editionId: activeEditionId,
      });
      applyComposerRestore(
        buildComposerRestoreFromEdition(
          result,
          settings?.defaultAudienceFilters ?? DEFAULT_NEWSLETTER_AUDIENCE_FILTERS
        )
      );
      setPreparedQueueCount(null);
      clearPreparedEditionSnapshot();
      setActiveEditionId(null);
      setComposerEditionId(null);
      setCancelPrepareConfirmOpen(false);
      setHistoryRefreshKey((k) => k + 1);
      toast.success(
        `Préparation annulée — brouillon restauré (${result.cancelledQueueCount} email${
          result.cancelledQueueCount !== 1 ? "s" : ""
        } retiré${result.cancelledQueueCount !== 1 ? "s" : ""} de la file)`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Annulation impossible");
    } finally {
      setCancellingPreparation(false);
    }
  };

  const handlePrepareCampaign = async () => {
    if (!subject.trim() || !plainBody.trim()) {
      toast.error("Contenu incomplet");
      return;
    }
    if (!etiquetteInfo) {
      toast.error("Étiquette Newsletter introuvable");
      return;
    }
    if (!emailConnected && !settings?.brevoApiKeyConfigured) {
      toast.error(
        "Connectez Gmail (Paramètres → Emails) ou configurez Brevo pour préparer la campagne"
      );
      return;
    }
    setPreparing(true);
    try {
      const draftContent = currentDraft;
      const html = buildNewsletterHtml(draftContent, htmlOptions);
      const result = await prepareNewsletterEdition({
        etiquetteId: etiquetteInfo.id,
        editionLabel: formatNewsletterEditionLabel(),
        subject: subject.trim(),
        plainBody: plainBody.trim(),
        contentJson: JSON.stringify(draftContent),
        htmlMeta: serializeNewsletterTemplateMeta(html),
        theme: theme.trim() || null,
        editionInstructions: editionInstructions.trim() || null,
        filters: audienceFilters,
      });
      setPreparedQueueCount(result.queued);
      setPreparedEditionQueuedCount(result.queued);
      setActiveEditionId(result.editionId);
      setComposerEditionId(result.editionId);
      setHistoryExpandEditionId(result.editionId);
      setHistoryRefreshKey((k) => k + 1);
      await loadPreparedEditionSnapshot(result.editionId);
      const reset = resetComposerState();
      setTheme(reset.theme);
      setEditionInstructions(reset.editionInstructions);
      setStructurePresetId(reset.structurePresetId);
      setChatHistory(reset.chatHistory);
      setChatSessionKey((k) => k + 1);
      toast.success(
        `${result.queued} destinataire${result.queued !== 1 ? "s" : ""} en file` +
          (result.skippedNoEmail > 0 ? ` (${result.skippedNoEmail} sans email ignorés)` : "") +
          " — corrigez le contenu ci-dessous si besoin, puis envoyez ou poussez vers Brevo"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Préparation campagne impossible");
    } finally {
      setPreparing(false);
    }
  };

  const runBatchSend = async () => {
    if (!etiquetteInfo || !preparedQueueCount || !activeEditionId) {
      toast.error("Préparez la campagne d'abord");
      return;
    }
    if (!emailConnected) {
      toast.error("Connectez Gmail dans Paramètres → Emails & envois → Connexion");
      return;
    }
    setSendConfirmOpen(false);
    batchAbortRef.current = new AbortController();
    setBatchSending(true);
    setBatchProgress({ sent: 0, total: preparedQueueCount });
    const endActivity = beginBackgroundActivity("newsletter-send");
    try {
      const result = await sendNewsletterBatch({
        etiquetteId: etiquetteInfo.id,
        editionId: activeEditionId,
        sendDelayMs,
        cgp,
        signal: batchAbortRef.current.signal,
        onProgress: (p) => setBatchProgress({ sent: p.sent, total: p.total }),
      });
      const remaining = await countNewsletterReady(etiquetteInfo.id, activeEditionId);
      setPreparedQueueCount(remaining > 0 ? remaining : null);
      if (remaining === 0) {
        setActiveEditionId(null);
      }
      setHistoryRefreshKey((k) => k + 1);
      if (batchAbortRef.current.signal.aborted) {
        toast.info(`Envoi interrompu — ${result.sent}/${result.total} envoyé(s)`);
      } else if (result.errors.length > 0) {
        toast.warning(
          `${result.sent}/${result.total} envoyés — ${result.errors.length} erreur(s)`
        );
      } else {
        toast.success(`${result.sent} email${result.sent !== 1 ? "s" : ""} envoyé${result.sent !== 1 ? "s" : ""}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi groupé impossible");
    } finally {
      setBatchSending(false);
      setBatchProgress(null);
      batchAbortRef.current = null;
      endActivity();
    }
  };

  const handleCancelBatchSend = () => {
    batchAbortRef.current?.abort();
  };

  const runPushToBrevo = async () => {
    if (!activeEditionId) {
      toast.error("Préparez la campagne d'abord");
      return;
    }
    const templateId =
      selectedBrevoTemplateId.trim() ?
        Number(selectedBrevoTemplateId)
      : settings?.defaultBrevoTemplateId ?? null;
    if (!templateId || Number.isNaN(templateId)) {
      toast.error("Choisissez un template Brevo (Paramètres ou ci-dessous)");
      return;
    }
    const hasLiveComposerContent = Boolean(subject.trim() || content || plainBody.trim());
    setBrevoPushing(true);
    try {
      const result = await pushNewsletterEditionToBrevo({
        editionId: activeEditionId,
        templateId,
        ...(hasLiveComposerContent ?
          {
            subject: subject.trim(),
            plainBody: plainBody.trim(),
            contentJson: JSON.stringify(currentDraft),
          }
        : {}),
      });
      setBrevoCampaignListUrl(result.campaignListUrl);
      setBrevoCampaignName(result.campaignName);
      setActiveEditionBrevoCampaignId(result.campaignId);
      setHistoryRefreshKey((k) => k + 1);
      const warning = result.recordWarning?.trim();
      const preparedCount =
        result.preparedRecipientCount ?? preparedEditionQueuedCount ?? result.recipientCount;
      const syncDetail =
        result.recipientCount !== preparedCount ?
          `${result.recipientCount} synchronisé${result.recipientCount !== 1 ? "s" : ""} sur ${preparedCount} préparé${preparedCount !== 1 ? "s" : ""}`
        : `${result.recipientCount} destinataire${result.recipientCount !== 1 ? "s" : ""}`;
      toast.success(
        `Contacts synchronisés vers Brevo — ${syncDetail} (« ${result.campaignName} »). Ouvrez le brouillon dans Brevo, « Modifier le design », collez le texte du compositeur, puis envoyez.`,
        warning ? { description: warning } : undefined
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.trim() || "Synchronisation Brevo impossible");
    } finally {
      setBrevoPushing(false);
      setBrevoRepushConfirmOpen(false);
    }
  };

  const handlePushToBrevo = () => {
    if (!activeEditionId) {
      toast.error("Préparez la campagne d'abord");
      return;
    }
    if (audienceDrift) {
      toast.error(
        `L'audience affichée ne correspond pas à la campagne préparée (${preparedEditionQueuedCount ?? 0} destinataire${(preparedEditionQueuedCount ?? 0) !== 1 ? "s" : ""}). Cliquez sur « Préparer la campagne » pour mettre à jour.`
      );
      return;
    }
    if (activeEditionBrevoCampaignId != null) {
      setBrevoRepushConfirmOpen(true);
      return;
    }
    void runPushToBrevo();
  };

  const handleResumeSend = async (edition: NewsletterEditionSummary) => {
    if (!etiquetteInfo) {
      toast.error("Étiquette Newsletter introuvable");
      return;
    }
    setResumingEditionId(edition.id);
    try {
      const ready = await countNewsletterReady(etiquetteInfo.id, edition.id);
      if (ready <= 0) {
        toast.error("Aucun destinataire en file pour cette édition");
        return;
      }
      setActiveEditionId(edition.id);
      setPreparedQueueCount(ready);
      await loadPreparedEditionSnapshot(edition.id);
      setHistoryExpandEditionId(edition.id);
      setHistoryRefreshKey((k) => k + 1);
      toast.success(
        `${ready} email${ready !== 1 ? "s" : ""} prêt${ready !== 1 ? "s" : ""} — utilisez « Envoyer la campagne » ci-dessus`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de relancer l'envoi");
    } finally {
      setResumingEditionId(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Newsletter</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Génération IA, envoi à toute la base (sauf désinscrits et exclusions)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {settings?.apiKeyConfigured ?
            <Badge variant="outline" className="font-normal">
              {newsletterLlmProviderOption(settings.llmProvider).label} connecté
            </Badge>
          : <Badge variant="secondary" className="font-normal">
              Clé API à configurer
            </Badge>
          }
          {hasActivePreparedCampaign ?
            <Badge variant="default" className="font-normal">
              {preparedEditionQueuedCount} destinataire
              {(preparedEditionQueuedCount ?? 0) !== 1 ? "s" : ""} préparé
              {(preparedEditionQueuedCount ?? 0) !== 1 ? "s" : ""}
              {preparedQueueCount != null && preparedQueueCount > 0 ?
                ` · ${preparedQueueCount} en file Gmail`
              : ""}
            </Badge>
          : null}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "composer" | "settings")}>
        <TabsList>
          <TabsTrigger value="composer">Composer</TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="h-4 w-4 mr-1" />
            Paramètres
          </TabsTrigger>
        </TabsList>

        <TabsContent value="composer" className="mt-4 space-y-4">
          <NewsletterAudiencePanel
            filters={audienceFilters}
            settingsAudienceFilters={
              settings?.defaultAudienceFilters ?? DEFAULT_NEWSLETTER_AUDIENCE_FILTERS
            }
            settingsExcludeContactIds={
              settings?.defaultAudienceFilters.excludeContactIds ?? []
            }
            onFiltersChange={setAudienceFilters}
            onPreviewChange={setAudiencePreview}
            onOpenContact={(id, ids) => void openContactSheet(id, ids ?? audienceContactIds)}
          />

          {hasActivePreparedCampaign ?
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-4 flex flex-col gap-4">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    Campagne prête — {preparedEditionQueuedCount} destinataire
                    {(preparedEditionQueuedCount ?? 0) !== 1 ? "s" : ""} figé
                    {(preparedEditionQueuedCount ?? 0) !== 1 ? "s" : ""} pour l&apos;envoi
                  </p>
                  {preparedQueueCount != null && preparedQueueCount > 0 ?
                    <p className="text-muted-foreground mt-1 text-xs">
                      {preparedQueueCount} email{preparedQueueCount !== 1 ? "s" : ""} encore en file
                      Gmail
                    </p>
                  : null}
                  {audienceDrift ?
                    <p className="text-amber-700 dark:text-amber-400 mt-1 text-xs">
                      L&apos;audience affichée ({audiencePreview?.eligible ?? 0} sélectionné
                      {(audiencePreview?.eligible ?? 0) !== 1 ? "s" : ""}) ne correspond plus à la
                      campagne préparée — recliquez sur « Préparer la campagne » avant le push Brevo.
                    </p>
                  : null}
                  {batchProgress ?
                    <p className="text-muted-foreground mt-1 flex items-center gap-2">
                      {batchSending ?
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      : null}
                      Envoi en cours… {batchProgress.sent}/{batchProgress.total}
                    </p>
                  : <p className="text-muted-foreground mt-1">
                      Délai {Math.round(sendDelayMs / 1000)} s entre chaque envoi (Gmail)
                    </p>
                  }
                  {settings?.brevoApiKeyConfigured ?
                    <div className="mt-3 space-y-2 rounded-md border bg-background/80 p-3">
                      <p className="text-xs font-medium">Envoi via Brevo</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                          value={selectedBrevoTemplateId}
                          onChange={(e) => setSelectedBrevoTemplateId(e.target.value)}
                          disabled={loadingBrevoTemplates || brevoTemplates.length === 0}
                        >
                          <option value="">Template Brevo…</option>
                          {brevoTemplates.map((template) => (
                            <option key={template.id} value={String(template.id)}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={brevoPushing || loadingBrevoTemplates || audienceDrift}
                          onClick={handlePushToBrevo}
                          title={
                            audienceDrift ?
                              "L'audience a changé depuis la préparation — préparez à nouveau la campagne"
                            : undefined
                          }
                        >
                          {brevoPushing ?
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : <ExternalLink className="h-4 w-4 mr-2" />}
                          Pousser les contacts vers Brevo
                        </Button>
                      </div>
                      {brevoCampaignListUrl ?
                        <div className="space-y-1">
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={() => void openExternalUrl(brevoCampaignListUrl)}
                          >
                            Ouvrir les brouillons Brevo
                          </Button>
                          {brevoCampaignName ?
                            <p className="text-xs text-muted-foreground">
                              Filtre <strong>Brouillons</strong> → « <strong>{brevoCampaignName}</strong> »
                              {activeEditionBrevoCampaignId != null ?
                                ` (#${activeEditionBrevoCampaignId})`
                              : ""}
                              . Puis <strong>Modifier le design</strong> : collez le texte du compositeur,
                              mettez en forme, <strong>Aperçu et test</strong>, envoyez.
                            </p>
                          : null}
                          <p className="text-xs text-muted-foreground">
                            Le template choisi ci-dessus sert de mise en page de base (configuré une
                            fois dans Brevo). Le texte de chaque édition se colle dans le brouillon,
                            pas dans le template transactionnel.
                          </p>
                        </div>
                      : <p className="text-xs text-muted-foreground">
                          Synchronise les destinataires et crée un brouillon campagne dans Brevo
                          (template + objet). Ensuite : brouillon → Modifier le design → coller le
                          texte → envoyer.
                        </p>
                      }
                    </div>
                  : null}
                </div>
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full min-w-0">
                  {batchSending ?
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full sm:w-auto"
                      onClick={handleCancelBatchSend}
                    >
                      Annuler l&apos;envoi
                    </Button>
                  : <>
                      {activeEditionId != null && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => void openPreparedReview(activeEditionId)}
                        >
                          <Eye className="h-4 w-4 mr-2 shrink-0" />
                          Revoir le contenu
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => setCancelPrepareConfirmOpen(true)}
                      >
                        <Undo2 className="h-4 w-4 mr-2 shrink-0" />
                        Annuler la préparation
                      </Button>
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        disabled={!emailConnected || preparedQueueCount == null || preparedQueueCount <= 0}
                        onClick={() => setSendConfirmOpen(true)}
                      >
                        <Send className="h-4 w-4 mr-2 shrink-0" />
                        Envoyer (Gmail)
                      </Button>
                    </>
                  }
                </div>
              </CardContent>
            </Card>
          : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Thème du numéro</CardTitle>
              <CardDescription>
                L&apos;IA rédige le contenu selon votre style (modifiable dans Paramètres)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newsletter-theme">Sujet / thème</Label>
                <Input
                  id="newsletter-theme"
                  placeholder="Ex. Assurance emprunteur, bilan fin d'année, taux directeurs…"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newsletter-structure">Format du numéro</Label>
                <select
                  id="newsletter-structure"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={structurePresetId}
                  onChange={(e) => setStructurePresetId(e.target.value)}
                >
                  {NEWSLETTER_STRUCTURE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newsletter-edition">Instructions pour cette édition (optionnel)</Label>
                <Input
                  id="newsletter-edition"
                  placeholder="Ex. Ton plus sobre, insister sur le CTA agenda…"
                  value={editionInstructions}
                  onChange={(e) => setEditionInstructions(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={duplicating}
                onClick={() => void handleDuplicateLastEdition()}
              >
                {duplicating ?
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Copy className="h-4 w-4 mr-2" />}
                Dupliquer la dernière édition
              </Button>
              <Button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating || !settings?.apiKeyConfigured}
              >
                {generating ?
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Génération…
                  </>
                : <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Générer avec l&apos;IA
                  </>
                }
              </Button>
              {!settings?.apiKeyConfigured && (
                <p className="text-xs text-muted-foreground">
                  Configurez votre clé API dans l&apos;onglet{" "}
                  <button
                    type="button"
                    className="underline text-primary"
                    onClick={() => setTab("settings")}
                  >
                    Paramètres
                  </button>
                  .
                </p>
              )}
            </CardContent>
          </Card>

          {(content || plainBody) && (
            <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Édition</CardTitle>
                  <CardDescription>
                    Texte brut ou sections structurées — variables{" "}
                    {"{{prenom}}"}, {"{{nom}}"}, {"{{cabinet}}"}, {"{{lien_agenda}}"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nl-subject">Objet</Label>
                    <Input
                      id="nl-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <Tabs
                    value={editMode}
                    onValueChange={(v) => setEditMode(v as NewsletterEditMode)}
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="plain">Texte brut</TabsTrigger>
                      <TabsTrigger value="sections">Sections</TabsTrigger>
                    </TabsList>
                    <TabsContent value="plain" className="mt-3 space-y-2">
                      <Textarea
                        id="nl-body"
                        rows={16}
                        className="font-mono text-sm"
                        value={plainBody}
                        onChange={(e) => handlePlainBodyChange(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2 bg-muted/30">
                        Lignes vides = nouvelle section. Dernier paragraphe = CTA. Salutation +
                        intro : évitez une ligne vide entre les deux. Pour les images, blocs enrichis
                        et mise en page : passez en mode <strong>Sections</strong>.
                      </p>
                    </TabsContent>
                    <TabsContent value="sections" className="mt-3">
                      <NewsletterSectionEditor
                        draft={currentDraft}
                        onChange={handleSectionDraftChange}
                        conseillerDefaults={conseillerDefaults}
                        footerProfile={footerProfile}
                      />
                    </TabsContent>
                  </Tabs>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={sendingTest}
                      onClick={() => void handleSendTest()}
                    >
                      {sendingTest ?
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <Mail className="h-4 w-4 mr-2" />}
                      M&apos;envoyer un test
                    </Button>
                    <Button
                      type="button"
                      disabled={preparing}
                      onClick={() => void handlePrepareCampaign()}
                    >
                      {preparing ?
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <Save className="h-4 w-4 mr-2" />}
                      Préparer la campagne
                    </Button>
                  </div>
                  {!newsletterChecklistOk({
                    preview: audiencePreview,
                    emailConnected,
                    brevoConfigured: settings?.brevoApiKeyConfigured,
                    hasContent: Boolean(subject.trim() && plainBody.trim()),
                  }).ok && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {newsletterChecklistOk({
                        preview: audiencePreview,
                        emailConnected,
                        brevoConfigured: settings?.brevoApiKeyConfigured,
                        hasContent: Boolean(subject.trim() && plainBody.trim()),
                      }).messages.join(" · ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Met à jour le modèle « Newsletter » (sans en créer un nouveau) et enregistre
                    l&apos;édition dans l&apos;historique.
                  </p>
                </CardContent>
              </Card>

              <Card className="flex h-full min-h-0 flex-col">
                <CardHeader className="shrink-0">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Aperçu HTML
                  </CardTitle>
                  <CardDescription>
                    Aperçu mobile par défaut — la majorité des lectures se font sur téléphone
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col space-y-3">
                  <NewsletterInboxPreview
                    subject={subject}
                    draft={currentDraft}
                    variables={templateVariables}
                  />
                  <NewsletterHtmlPreviewFrame html={previewHtml} className="min-h-0 flex-1" />
                </CardContent>
              </Card>
            </div>
          )}

          {(content || plainBody) && (
            <NewsletterChatPanel
              draft={currentDraft}
              onDraftUpdated={applyDraft}
              history={chatHistory}
              onHistoryChange={setChatHistory}
              disabled={!settings?.apiKeyConfigured}
            />
          )}

          <NewsletterHistoryPanel
            refreshKey={historyRefreshKey}
            initialExpandedEditionId={historyExpandEditionId}
            onOpenContact={(id, ids) => void openContactSheet(id, ids)}
            onResumeSend={(edition) => void handleResumeSend(edition)}
            resumingEditionId={resumingEditionId}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
          <ParametresNewsletterSection
            switchToComposerAfterSave
            onSwitchToComposer={() => setTab("composer")}
            onSettingsSync={(saved) => {
              setSettings(saved);
              setSendDelayMs(saved.sendDelayMs);
            }}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={preparedReviewOpen} onOpenChange={setPreparedReviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contenu de la campagne préparée</DialogTitle>
            <DialogDescription>
              {preparedEditionDetail ?
                `${preparedEditionDetail.editionLabel} — ${preparedEditionDetail.queuedCount} destinataire${preparedEditionDetail.queuedCount !== 1 ? "s" : ""} en file`
              : "Chargement…"}
            </DialogDescription>
          </DialogHeader>
          {loadingPreparedReview ?
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </p>
          : preparedEditionDetail ?
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium">Objet :</span> {preparedEditionDetail.subject}
              </p>
              <pre className="whitespace-pre-wrap font-mono text-xs rounded-md border bg-muted/30 p-3 max-h-96 overflow-y-auto">
                {preparedEditionDetail.plainBody}
              </pre>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPreparedReviewOpen(false);
                  setHistoryExpandEditionId(preparedEditionDetail.id);
                  setHistoryRefreshKey((k) => k + 1);
                }}
              >
                Voir dans l&apos;historique
              </Button>
            </div>
          : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l&apos;envoi de la campagne</AlertDialogTitle>
            <AlertDialogDescription>
              Vous allez envoyer cette newsletter à{" "}
              <strong>
                {preparedQueueCount ?? 0} destinataire
                {(preparedQueueCount ?? 0) !== 1 ? "s" : ""}
              </strong>
              . Cette action enverra un email Gmail à chaque contact coché (délai{" "}
              {Math.round(sendDelayMs / 1000)} s entre chaque envoi).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runBatchSend()}>
              Envoyer maintenant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={generateWhilePreparedConfirmOpen}
        onOpenChange={setGenerateWhilePreparedConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Générer une nouvelle newsletter ?</AlertDialogTitle>
            <AlertDialogDescription>
              Une campagne est déjà préparée ({preparedEditionQueuedCount ?? 0} destinataire
              {(preparedEditionQueuedCount ?? 0) !== 1 ? "s" : ""}). La nouvelle génération ne met pas à
              jour la file Gmail — recliquez sur « Préparer la campagne » pour cela. Le push Brevo
              reprendra toujours le contenu affiché dans le compositeur ci-dessous.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runGenerate()}>
              Générer quand même
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={brevoRepushConfirmOpen} onOpenChange={setBrevoRepushConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resynchroniser vers Brevo ?</AlertDialogTitle>
            <AlertDialogDescription>
              Un brouillon Brevo existe déjà pour cette édition (campagne #
              {activeEditionBrevoCampaignId}). Un nouveau push créera une{" "}
              <strong>nouvelle</strong> liste de contacts et une nouvelle campagne brouillon.
              Vos retouches sur l&apos;ancien brouillon ou template Brevo ne seront pas modifiées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runPushToBrevo()}>
              Créer une nouvelle synchro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelPrepareConfirmOpen}
        onOpenChange={(open) => {
          if (!cancellingPreparation) setCancelPrepareConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la préparation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les {preparedEditionQueuedCount ?? 0} email
              {(preparedEditionQueuedCount ?? 0) !== 1 ? "s" : ""} seront
              retirés de la file d&apos;envoi (Suivi → Envois → Retirés). Le contenu de cette
              édition sera rechargé dans le composeur pour modification.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingPreparation}>Garder en file</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancellingPreparation}
              onClick={(e) => {
                e.preventDefault();
                void handleCancelPreparation();
              }}
            >
              {cancellingPreparation ?
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Annulation…
                </>
              : "Rebasculer en brouillon"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="border-dashed">
        <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
          <Send className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="flex-1 text-muted-foreground">
            Les désinscriptions sont enregistrées automatiquement lorsqu&apos;un contact clique sur
            «&nbsp;Se désinscrire&nbsp;» dans le pied de page et envoie l&apos;email prérempli.
            Suivi détaillé dans{" "}
            <strong>Suivi → Envois</strong> si besoin.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => onNavigate?.("suivi")}
          >
            Suivi → Envois
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>

      {contactDetailSheet}
    </div>
  );
}
