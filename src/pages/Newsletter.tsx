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
} from "lucide-react";
import {
  DEFAULT_NEWSLETTER_AUDIENCE_FILTERS,
  ensureNewsletterEtiquette,
  generateNewsletterContent,
  cancelNewsletterPreparation,
  getLastNewsletterEditionDuplicate,
  getNewsletterEditionDetail,
  getNewsletterSettings,
  listNewsletterEditions,
  prepareNewsletterEdition,
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
import { buildComposerRestoreFromEdition } from "@/lib/newsletter/newsletter-composer-restore";
import { isResumableNewsletterEdition } from "@/lib/newsletter/newsletter-edition-resume";
import { mergeNewsletterAudienceFilters } from "@/lib/newsletter/newsletter-audience-utils";
import { beginBackgroundActivity } from "@/lib/background-activity";
import { toast } from "sonner";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";

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
  const [activeEditionId, setActiveEditionId] = useState<number | null>(
    restoredDraft?.activeEditionId ?? null
  );
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

  const { openContactSheet, sheet: contactDetailSheet } = useContactDetailSheet({ onNavigate });

  const audienceContactIds = useMemo(
    () => audiencePreview?.recipients.map((r) => r.contactId).filter((id) => id > 0) ?? [],
    [audiencePreview]
  );

  const load = useCallback(async () => {
    const [s, cgpConfig, emailSt] = await Promise.all([
      getNewsletterSettings(),
      getCgpConfig().catch(() => null),
      getEmailConnectionStatus().catch(() => null),
    ]);
    setSettings(s);
    setSendDelayMs(s.sendDelayMs);
    setCgp(cgpConfig);
    setEmailConnected(Boolean(emailSt?.connected && emailSt.method === "oauth"));
    const etiq = await ensureNewsletterEtiquette(s.etiquetteNom);
    setEtiquetteInfo({ id: etiq.etiquetteId });
    const editions = await listNewsletterEditions(15);
    const resumableEditions = editions.filter(isResumableNewsletterEdition);
    const resumable = resumableEditions[0] ?? null;
    const storedStillSendable =
      activeEditionId != null &&
      resumableEditions.some((edition) => edition.id === activeEditionId);
    const editionId = storedStillSendable ? activeEditionId : (resumable?.id ?? null);
    if (editionId != null && editionId !== activeEditionId) {
      setActiveEditionId(editionId);
    }
    const ready = await countNewsletterReady(etiq.etiquetteId, editionId);
    if (ready > 0) {
      setPreparedQueueCount(ready);
    } else if (!storedStillSendable && resumable == null) {
      setPreparedQueueCount(null);
      setActiveEditionId(null);
    }
  }, [activeEditionId]);

  useEffect(() => {
    void load().catch((e) => {
      console.error(e);
      toast.error("Impossible de charger la newsletter");
    });
  }, [load]);

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
      toast.success("Newsletter générée — discutez avec Mistral pour affiner");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur Mistral");
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
      toast.error("Connectez Gmail dans Paramètres → Email");
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
      setActiveEditionId(null);
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
    if (!emailConnected) {
      toast.error("Connectez Gmail dans Paramètres → Email");
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
        filters: mergeNewsletterAudienceFilters(
          settings?.defaultAudienceFilters ?? DEFAULT_NEWSLETTER_AUDIENCE_FILTERS,
          audienceFilters
        ),
      });
      setPreparedQueueCount(result.queued);
      setActiveEditionId(result.editionId);
      setHistoryExpandEditionId(result.editionId);
      setHistoryRefreshKey((k) => k + 1);
      const reset = resetComposerState();
      setTheme(reset.theme);
      setEditionInstructions(reset.editionInstructions);
      setStructurePresetId(reset.structurePresetId);
      setEditMode(reset.editMode);
      setContent(reset.content);
      setSubject(reset.subject);
      setPlainBody(reset.plainBody);
      setPreviewHtml(reset.previewHtml);
      setChatHistory(reset.chatHistory);
      setChatSessionKey((k) => k + 1);
      setAudienceFilters({ ...DEFAULT_NEWSLETTER_AUDIENCE_FILTERS, excludeContactIds: [] });
      toast.success(
        `${result.queued} destinataire${result.queued !== 1 ? "s" : ""} en file` +
          (result.skippedNoEmail > 0 ? ` (${result.skippedNoEmail} sans email ignorés)` : "") +
          " — utilisez « Revoir le contenu préparé » si besoin"
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
      toast.error("Connectez Gmail dans Paramètres → Email");
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
            Génération Mistral, envoi à toute la base (sauf désinscrits et exclusions)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {settings?.apiKeyConfigured ?
            <Badge variant="outline" className="font-normal">
              Mistral connecté
            </Badge>
          : <Badge variant="secondary" className="font-normal">
              Clé API à configurer
            </Badge>
          }
          {preparedQueueCount != null && preparedQueueCount > 0 && (
            <Badge variant="default" className="font-normal">
              {preparedQueueCount} en file d&apos;envoi
            </Badge>
          )}
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

          {preparedQueueCount != null && preparedQueueCount > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 text-sm">
                  <p className="font-medium">
                    Campagne prête — {preparedQueueCount} email
                    {preparedQueueCount !== 1 ? "s" : ""} à envoyer
                  </p>
                  {batchProgress ?
                    <p className="text-muted-foreground mt-1 flex items-center gap-2">
                      {batchSending ?
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      : null}
                      Envoi en cours… {batchProgress.sent}/{batchProgress.total}
                    </p>
                  : <p className="text-muted-foreground mt-1">
                      Délai {Math.round(sendDelayMs / 1000)} s entre chaque envoi
                    </p>
                  }
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {batchSending ?
                    <Button type="button" variant="destructive" onClick={handleCancelBatchSend}>
                      Annuler l&apos;envoi
                    </Button>
                  : <>
                      {activeEditionId != null && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void openPreparedReview(activeEditionId)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Revoir le contenu préparé
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCancelPrepareConfirmOpen(true)}
                      >
                        <Undo2 className="h-4 w-4 mr-2" />
                        Annuler la préparation
                      </Button>
                      <Button
                        type="button"
                        disabled={!emailConnected}
                        onClick={() => setSendConfirmOpen(true)}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Envoyer la campagne
                      </Button>
                    </>
                  }
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Thème du numéro</CardTitle>
              <CardDescription>
                Mistral rédige le contenu selon votre style (modifiable dans Paramètres)
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
                    Générer avec Mistral
                  </>
                }
              </Button>
              {!settings?.apiKeyConfigured && (
                <p className="text-xs text-muted-foreground">
                  Configurez votre clé API dans{" "}
                  <button
                    type="button"
                    className="underline text-primary"
                    onClick={() => onNavigate?.("parametres")}
                  >
                    Paramètres → Newsletter
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
                    hasContent: Boolean(subject.trim() && plainBody.trim()),
                  }).ok && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {newsletterChecklistOk({
                        preview: audiencePreview,
                        emailConnected,
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
          <p className="text-sm text-muted-foreground">
            Les mêmes réglages sont disponibles dans{" "}
            <button
              type="button"
              className="underline text-primary"
              onClick={() => onNavigate?.("parametres")}
            >
              Paramètres → Newsletter
            </button>
            .
          </p>
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
        open={cancelPrepareConfirmOpen}
        onOpenChange={(open) => {
          if (!cancellingPreparation) setCancelPrepareConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la préparation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les {preparedQueueCount ?? 0} email{(preparedQueueCount ?? 0) !== 1 ? "s" : ""} seront
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
