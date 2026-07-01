import { useState, useEffect, useMemo, useRef, useCallback, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";
import {
  insertTextInRichEditor,
  saveRichEditorSelection,
} from "@/components/emails/rich-text-email-editor-utils";
import { insertTextInPlainField } from "@/lib/emails/insert-text-at-cursor";
import {
  getTemplateCorpsHtml,
  htmlToPlainEmail,
  plainTextToTemplateHtml,
  canonicalizeTemplateCorpsHtml,
  sanitizeTemplateEmailHtml,
  setTemplateCorpsHtmlInMeta,
} from "@/lib/emails/template-email-html";
import {
  etiquettesSouscriptionDuplicateForTemplate,
  formatSouscriptionDuplicateWarning,
} from "@/lib/emails/template-etiquette-duplicate";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createTemplateEmail,
  updateTemplateEmail,
  getTemplateEmailById,
  getEtiquetteIdsForTemplate,
  setTemplateEtiquetteLinks,
  type NewTemplateEmail,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { stampScpiBulletinTemplateMeta } from "@/lib/emails/scpi-template-meta";
import {
  isStelliumPerfTemplateNom,
  stampStelliumPerfTemplateMeta,
  STELLIUM_PERF_TEMPLATE_VARIABLES,
} from "@/lib/emails/stellium-template-meta";
import {
  TemplateEmailRelancePanel,
  type TemplateRelanceDraft,
} from "@/components/emails/TemplateEmailRelancePanel";
import {
  TemplateEmailTutoiementPanel,
  type TemplateTutoiementDraft,
} from "@/components/emails/TemplateEmailTutoiementPanel";
import { buildTutoiementTemplateNom } from "@/lib/emails/template-email-formality";
import { parseTemplateEmailMeta } from "@/lib/emails/template-email-html";
import {
  buildRelanceTemplateNom,
  DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS,
  DEFAULT_TEMPLATE_EMAIL_RELANCE,
  parseTemplateEmailRelance,
  relanceJoursFromConfig,
  setTemplateEmailRelanceInMeta,
  TEMPLATE_EMAIL_RELANCE_KEY,
} from "@/lib/emails/template-email-relance";
import {
  serializeEmailEnvoiJoursSemaine,
} from "@/lib/emails/email-envoi-schedule";
import {
  parseTemplateEmailSuiviReponse,
  setTemplateEmailSuiviReponseInMeta,
} from "@/lib/emails/template-email-suivi-reponse";
import { getAllEtiquettes, type Etiquette } from "@/lib/api/tauri-etiquettes";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { archiveEphemeralCampaign } from "@/lib/api/tauri-ephemeral-campaign";
import {
  EMAIL_TEMPLATE_CATEGORIES,
  EMAIL_TEMPLATE_VARIABLES,
  getAgendaVariableTokens,
  getTemplateCategoryMeta,
  normalizeAgendaLinks,
} from "@/lib/emails/template-email-meta";
import { TemplateEmailPreviewPanel } from "@/components/emails/TemplateEmailPreviewPanel";
import { TemplateEmailTriggerPanel } from "@/components/emails/TemplateEmailTriggerPanel";
import {
  DEFAULT_TEMPLATE_EMAIL_TRIGGER,
  parseTemplateEmailTrigger,
  setTemplateEmailTriggerInMeta,
  type TemplateEmailTriggerConfig,
} from "@/lib/emails/template-email-trigger";
import { CategoryTogglePills } from "@/components/etiquettes/etiquette-form-ui";
import {
  parseConditionConfig,
  type ConditionTypeProduit,
} from "@/lib/api/tauri-etiquettes";
import {
  isTypeProduitConditionValid,
  parseTypeProduitConditionConfig,
} from "@/lib/etiquettes/type-produit-condition";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TemplateEmailEphemeralAudiencePanel } from "@/components/emails/TemplateEmailEphemeralAudiencePanel";
import { TemplateEmailEphemeralRecipientsPanel } from "@/components/emails/TemplateEmailEphemeralRecipientsPanel";
import {
  DEFAULT_EPHEMERAL_CAMPAIGN,
  buildEphemeralSyncFingerprint,
  isEphemeralAudienceValid,
  isEphemeralTemplate,
  mergeEphemeralCampaignForSave,
  parseEphemeralCampaignConfig,
  setEphemeralCampaignInMeta,
  stampNewEphemeralTemplateMeta,
  type EphemeralCampaignConfig,
} from "@/lib/emails/template-email-ephemeral";

export type TemplateEmailFormMode = "permanent" | "ephemeral";

interface TemplateEmailFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateEmail | null;
  formMode?: TemplateEmailFormMode;
  onSuccess?: () => void | Promise<void>;
}

export function TemplateEmailForm({
  open,
  onOpenChange,
  template,
  formMode = "permanent",
  onSuccess,
}: TemplateEmailFormProps) {
  const isEphemeralMode =
    formMode === "ephemeral" ||
    (template != null && isEphemeralTemplate(template.variables));
  type FormTab =
    | "message"
    | "tutoiement"
    | "relance"
    | "declencheur"
    | "liaisons"
    | "audience"
    | "destinataires";
  const [loading, setLoading] = useState(false);
  const [formTab, setFormTab] = useState<FormTab>("message");
  const [relanceDraft, setRelanceDraft] = useState<TemplateRelanceDraft>({
    enabled: false,
    useSameMessage: true,
    sujet: "",
    corpsHtml: "",
    attendreReponse: true,
    delaiJours: DEFAULT_TEMPLATE_EMAIL_RELANCE.delai_jours ?? 7,
    envoiHeure: DEFAULT_TEMPLATE_EMAIL_RELANCE.envoi_heure ?? "18:30",
    envoiJours: null,
  });
  const [relanceTemplateId, setRelanceTemplateId] = useState<number | null>(null);
  const [tutoiementDraft, setTutoiementDraft] = useState<TemplateTutoiementDraft>({
    enabled: false,
    sujet: "",
    corpsHtml: "",
  });
  const [tutoiementTemplateId, setTutoiementTemplateId] = useState<number | null>(null);
  const [tutoiementVariables, setTutoiementVariables] = useState<string | null>(null);
  const [relanceTuDraft, setRelanceTuDraft] = useState<TemplateTutoiementDraft>({
    enabled: false,
    sujet: "",
    corpsHtml: "",
  });
  const [relanceTuTemplateId, setRelanceTuTemplateId] = useState<number | null>(null);
  const [previewRegistre, setPreviewRegistre] = useState<"VOUS" | "TU">("VOUS");
  const [emailTrigger, setEmailTrigger] = useState<TemplateEmailTriggerConfig>(
    DEFAULT_TEMPLATE_EMAIL_TRIGGER
  );
  const [cgp, setCgp] = useState<Awaited<ReturnType<typeof getCgpConfig>> | null>(null);
  const [previewContactId, setPreviewContactId] = useState<string>("sample");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>([]);
  const [linkedEtiquetteIds, setLinkedEtiquetteIds] = useState<number[]>([]);
  const [ephemeralCampaign, setEphemeralCampaign] = useState<EphemeralCampaignConfig>({
    ...DEFAULT_EPHEMERAL_CAMPAIGN,
  });
  const [ephemeralAudienceInvalid, setEphemeralAudienceInvalid] = useState(false);
  const [lastSavedEphemeralFingerprint, setLastSavedEphemeralFingerprint] = useState<
    string | null
  >(null);
  const [persistedTemplateId, setPersistedTemplateId] = useState<number | null>(null);
  const effectiveTemplateId = template?.id ?? persistedTemplateId;
  const [corpsHtml, setCorpsHtml] = useState("");
  const richEditorRef = useRef<HTMLDivElement>(null);
  const sujetInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const ephemeralSaveIntentRef = useRef<"default" | "sync" | "tab">("default");
  const openedWithTemplateIdRef = useRef<number | null>(null);
  const [confirmAbandonOnClose, setConfirmAbandonOnClose] = useState(false);
  const [destinatairesTabPending, setDestinatairesTabPending] = useState(false);
  const [abandonConfirmOpen, setAbandonConfirmOpen] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const saveBeforeSyncRef = useRef<{
    resolve: () => void;
    reject: (reason?: unknown) => void;
  } | null>(null);
  const sujetSelectionRef = useRef({ start: 0, end: 0 });
  const editorSelectionRef = useRef<Range | null>(null);
  const [formData, setFormData] = useState<NewTemplateEmail>({
    nom: "",
    sujet: "",
    corps: "",
    categorie: "RELANCE",
    variables: null,
    agenda_link_id: null,
    relance_template_id: null,
    tutoiement_template_id: null,
  });

  const hydrateFromTemplate = useCallback((source: TemplateEmail) => {
    setFormData({
      nom: source.nom,
      sujet: source.sujet,
      corps: source.corps,
      categorie: source.categorie,
      variables: source.variables,
      agenda_link_id: source.agenda_link_id,
      relance_template_id: source.relance_template_id,
      tutoiement_template_id: source.tutoiement_template_id,
    });
    const storedHtml = getTemplateCorpsHtml(source.variables);
    setCorpsHtml(storedHtml ?? plainTextToTemplateHtml(source.corps));
    setEmailTrigger(parseTemplateEmailTrigger(source.variables));
    setRelanceTemplateId(source.relance_template_id);
    setTutoiementTemplateId(source.tutoiement_template_id ?? null);
    setTutoiementVariables(null);
    const hasTu = source.tutoiement_template_id != null;
    setTutoiementDraft({
      enabled: hasTu,
      sujet: "",
      corpsHtml: "",
    });
    if (hasTu && source.tutoiement_template_id) {
      void getTemplateEmailById(source.tutoiement_template_id)
        .then((tu) => {
          const tuHtml = getTemplateCorpsHtml(tu.variables);
          setTutoiementVariables(tu.variables);
          setTutoiementDraft({
            enabled: true,
            sujet: tu.sujet,
            corpsHtml: tuHtml ?? plainTextToTemplateHtml(tu.corps),
          });
        })
        .catch(() => undefined);
    }
    const meta = parseTemplateEmailMeta(source.variables);
    const hasDedicated = source.relance_template_id != null;
    const relanceCfg = parseTemplateEmailRelance(source.variables);
    const relanceEnabled = TEMPLATE_EMAIL_RELANCE_KEY in meta
      ? relanceCfg.enabled
      : hasDedicated;
    setRelanceDraft({
      enabled: relanceEnabled,
      useSameMessage: !hasDedicated,
      sujet: "",
      corpsHtml: "",
      attendreReponse: parseTemplateEmailSuiviReponse(source.variables).attendre_reponse,
      delaiJours: relanceCfg.delai_jours ?? DEFAULT_TEMPLATE_EMAIL_RELANCE.delai_jours ?? 7,
      envoiHeure: relanceCfg.envoi_heure ?? DEFAULT_TEMPLATE_EMAIL_RELANCE.envoi_heure ?? "18:30",
      envoiJours: relanceJoursFromConfig(relanceCfg.envoi_jours_semaine),
    });
    if (hasDedicated && source.relance_template_id) {
      void getTemplateEmailById(source.relance_template_id)
        .then((rel) => {
          const relHtml = getTemplateCorpsHtml(rel.variables);
          setRelanceDraft((prev) => ({
            ...prev,
            sujet: rel.sujet,
            corpsHtml: relHtml ?? plainTextToTemplateHtml(rel.corps),
          }));
          const relTuId = rel.tutoiement_template_id ?? null;
          setRelanceTuTemplateId(relTuId);
          if (relTuId != null) {
            void getTemplateEmailById(relTuId)
              .then((relTu) => {
                const relTuHtml = getTemplateCorpsHtml(relTu.variables);
                setRelanceTuDraft({
                  enabled: true,
                  sujet: relTu.sujet,
                  corpsHtml: relTuHtml ?? plainTextToTemplateHtml(relTu.corps),
                });
              })
              .catch(() => undefined);
          } else {
            setRelanceTuDraft({ enabled: false, sujet: "", corpsHtml: "" });
          }
        })
        .catch(() => undefined);
    }
    const ephemeralCfg =
      parseEphemeralCampaignConfig(source.variables) ?? { ...DEFAULT_EPHEMERAL_CAMPAIGN };
    setEphemeralCampaign(ephemeralCfg);
    const htmlForFingerprint = canonicalizeTemplateCorpsHtml(
      (storedHtml ?? plainTextToTemplateHtml(source.corps)).trim()
    );
    setLastSavedEphemeralFingerprint(
      buildEphemeralSyncFingerprint({
        nom: source.nom,
        sujet: source.sujet,
        corpsHtml: htmlForFingerprint,
        agenda_link_id: source.agenda_link_id,
        campaign: ephemeralCfg,
      })
    );
  }, []);

  const resetCreateForm = useCallback(() => {
    const ephemeralDefaults = isEphemeralMode;
    setFormData({
      nom: "",
      sujet: "",
      corps: "",
      categorie: ephemeralDefaults ? "AUTRE" : "RELANCE",
      variables: null,
      agenda_link_id: null,
      relance_template_id: null,
      tutoiement_template_id: null,
    });
    setCorpsHtml("");
    setEmailTrigger(DEFAULT_TEMPLATE_EMAIL_TRIGGER);
    setRelanceDraft({
      enabled: false,
      useSameMessage: true,
      sujet: "",
      corpsHtml: "",
      attendreReponse: !ephemeralDefaults,
      delaiJours: DEFAULT_TEMPLATE_EMAIL_RELANCE.delai_jours ?? 7,
      envoiHeure: DEFAULT_TEMPLATE_EMAIL_RELANCE.envoi_heure ?? "18:30",
      envoiJours: null,
    });
    setRelanceTemplateId(null);
    setTutoiementDraft({ enabled: false, sujet: "", corpsHtml: "" });
    setTutoiementTemplateId(null);
    setTutoiementVariables(null);
    setRelanceTuDraft({ enabled: false, sujet: "", corpsHtml: "" });
    setRelanceTuTemplateId(null);
    setPreviewRegistre("VOUS");
    setPreviewContactId("sample");
    setLinkedEtiquetteIds([]);
    setEphemeralCampaign({ ...DEFAULT_EPHEMERAL_CAMPAIGN });
    setEphemeralAudienceInvalid(false);
    setLastSavedEphemeralFingerprint(null);
    setConfirmAbandonOnClose(false);
  }, [isEphemeralMode]);

  useEffect(() => {
    if (!open) {
      setPersistedTemplateId(null);
      setAbandonConfirmOpen(false);
      setConfirmAbandonOnClose(false);
      return;
    }
    openedWithTemplateIdRef.current = template?.id ?? null;
    setConfirmAbandonOnClose(isEphemeralMode && template?.id == null);
    setFormTab("message");
    void getCgpConfig().then(setCgp).catch(() => setCgp(null));
    void getAllContacts()
      .then((list) => setContacts(list.filter((c) => c.email?.trim())))
      .catch(() => setContacts([]));
    void getAllEtiquettes().then(setEtiquettes).catch(() => setEtiquettes([]));
  }, [open, template?.id, isEphemeralMode]);

  useEffect(() => {
    if (!open) return;
    if (!template?.id) {
      if (!template) resetCreateForm();
      return;
    }
    let cancelled = false;
    void getTemplateEmailById(template.id)
      .then((fresh) => {
        if (!cancelled) hydrateFromTemplate(fresh);
      })
      .catch(() => {
        if (!cancelled) hydrateFromTemplate(template);
      });
    return () => {
      cancelled = true;
    };
  }, [open, template?.id, template, hydrateFromTemplate, resetCreateForm]);

  useEffect(() => {
    if (!open || !template?.id) {
      if (!template) setLinkedEtiquetteIds([]);
      return;
    }
    void getEtiquetteIdsForTemplate(template.id)
      .then(setLinkedEtiquetteIds)
      .catch(() => setLinkedEtiquetteIds([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recharge sur ouverture / changement d'id de template
  }, [open, template?.id]);

  const previewContact = useMemo(() => {
    if (previewContactId === "sample") return null;
    const id = parseInt(previewContactId, 10);
    return contacts.find((c) => c.id === id) ?? null;
  }, [previewContactId, contacts]);

  const previewTutoiement = useMemo(() => {
    if (!tutoiementDraft.enabled) return null;
    const plain = htmlToPlainEmail(tutoiementDraft.corpsHtml);
    return {
      sujet: tutoiementDraft.sujet,
      corps: plain || formData.corps,
      corpsHtml: tutoiementDraft.corpsHtml,
    };
  }, [tutoiementDraft, formData.corps]);

  const agendaLinks = useMemo(() => normalizeAgendaLinks(cgp), [cgp]);
  const agendaVariables = useMemo(() => getAgendaVariableTokens(agendaLinks), [agendaLinks]);

  const canonicalizeCorpsHtmlForSave = useCallback(
    (html: string) => canonicalizeTemplateCorpsHtml(html.trim()),
    []
  );

  const ephemeralSyncFingerprint = useMemo(
    () =>
      buildEphemeralSyncFingerprint({
        nom: formData.nom,
        sujet: formData.sujet,
        corpsHtml: canonicalizeCorpsHtmlForSave(corpsHtml),
        agenda_link_id: formData.agenda_link_id ?? null,
        campaign: ephemeralCampaign,
      }),
    [
      formData.nom,
      formData.sujet,
      formData.agenda_link_id,
      corpsHtml,
      ephemeralCampaign,
      canonicalizeCorpsHtmlForSave,
    ]
  );

  const rejectPendingEphemeralSave = (reason?: unknown) => {
    saveBeforeSyncRef.current?.reject(reason);
    saveBeforeSyncRef.current = null;
    ephemeralSaveIntentRef.current = "default";
  };

  const needsSaveBeforeEphemeralSync =
    isEphemeralMode &&
    lastSavedEphemeralFingerprint != null &&
    ephemeralSyncFingerprint !== lastSavedEphemeralFingerprint;

  /** Brouillon non persisté au départ — abandon à la fermeture tant qu’il n’a pas été enregistré. */
  const shouldConfirmAbandonEphemeral = useCallback((): boolean => {
    return (
      confirmAbandonOnClose &&
      effectiveTemplateId != null &&
      ephemeralCampaign.status === "draft"
    );
  }, [confirmAbandonOnClose, effectiveTemplateId, ephemeralCampaign.status]);

  const closeForm = useCallback(() => {
    rejectPendingEphemeralSave(new Error("closed"));
    onOpenChange(false);
  }, [onOpenChange]);

  const handleRequestClose = useCallback(() => {
    if (shouldConfirmAbandonEphemeral()) {
      setAbandonConfirmOpen(true);
      return;
    }
    closeForm();
  }, [shouldConfirmAbandonEphemeral, closeForm]);

  const handleConfirmAbandon = async () => {
    const id = effectiveTemplateId;
    if (id == null) {
      setAbandonConfirmOpen(false);
      closeForm();
      return;
    }
    setAbandoning(true);
    try {
      await archiveEphemeralCampaign(id);
      toast.success("Campagne abandonnée");
      setAbandonConfirmOpen(false);
      await onSuccess?.();
      closeForm();
    } catch (error) {
      console.error(error);
      toast.error("Impossible d'abandonner la campagne");
    } finally {
      setAbandoning(false);
    }
  };

  const stelliumVariables = useMemo(
    () => (isStelliumPerfTemplateNom(formData.nom) ? STELLIUM_PERF_TEMPLATE_VARIABLES : []),
    [formData.nom]
  );

  const categoryPills = EMAIL_TEMPLATE_CATEGORIES.map((c) => ({
    value: c.id,
    label: c.label,
  }));

  const souscriptionDuplicateWarning = useMemo(() => {
    if (
      !emailTrigger.enabled ||
      emailTrigger.condition_type !== "EVENEMENT_SOUSCRIPTION" ||
      !template?.id
    ) {
      return "";
    }
    const dupes = etiquettesSouscriptionDuplicateForTemplate(template.id, etiquettes);
    return formatSouscriptionDuplicateWarning(
      formData.nom.trim() || template.nom,
      dupes.map((e) => e.nom)
    );
  }, [
    emailTrigger.enabled,
    emailTrigger.condition_type,
    template?.id,
    template?.nom,
    formData.nom,
    etiquettes,
  ]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const corpsHtmlForSave = canonicalizeCorpsHtmlForSave(corpsHtml);
    const plainCorps = htmlToPlainEmail(corpsHtmlForSave) || formData.corps.trim();
    if (!formData.nom.trim() || !formData.sujet.trim() || !plainCorps) {
      toast.error("Nom, objet et message sont obligatoires");
      if (isEphemeralMode && ephemeralSaveIntentRef.current !== "default") {
        setFormTab("message");
      }
      rejectPendingEphemeralSave(new Error("validation"));
      return;
    }
    if (relanceDraft.enabled && !relanceDraft.useSameMessage) {
      const relPlain = htmlToPlainEmail(relanceDraft.corpsHtml);
      if (!relanceDraft.sujet.trim() || !relPlain) {
        toast.error("Relance : renseignez l'objet et le message (onglet Relance)");
        setFormTab("relance");
        rejectPendingEphemeralSave(new Error("validation"));
        return;
      }
      if (tutoiementDraft.enabled) {
        const relTuPlain = htmlToPlainEmail(relanceTuDraft.corpsHtml);
        if (!relanceTuDraft.sujet.trim() || !relTuPlain) {
          toast.error(
            "Relance : renseignez aussi l'objet et le message tutoiement (onglet Relance)"
          );
          setFormTab("relance");
          rejectPendingEphemeralSave(new Error("validation"));
          return;
        }
      }
    }
    if (tutoiementDraft.enabled) {
      const tuPlain = htmlToPlainEmail(tutoiementDraft.corpsHtml);
      if (!tutoiementDraft.sujet.trim() || !tuPlain) {
        toast.error("Tutoiement : renseignez l'objet et le message (onglet Tutoiement)");
        setFormTab("tutoiement");
        rejectPendingEphemeralSave(new Error("validation"));
        return;
      }
    }
    if (emailTrigger.enabled && emailTrigger.condition_type === "TYPE_PRODUIT") {
      const cfg = parseConditionConfig<ConditionTypeProduit>(emailTrigger.condition_config);
      const { types, nomsProduit } = parseTypeProduitConditionConfig(cfg);
      if (!isTypeProduitConditionValid(types, nomsProduit)) {
        toast.error("Déclencheur : sélectionnez au moins un type ou un nom de produit");
        setFormTab("declencheur");
        rejectPendingEphemeralSave(new Error("validation"));
        return;
      }
    }
    if (isEphemeralMode && !isEphemeralAudienceValid(ephemeralCampaign.audience)) {
      toast.error("Audience : sélectionnez au moins un type ou un nom de produit");
      setFormTab("audience");
      setEphemeralAudienceInvalid(true);
      rejectPendingEphemeralSave(new Error("validation"));
      return;
    }
    setEphemeralAudienceInvalid(false);

    setLoading(true);
    const saveIntentAtStart = ephemeralSaveIntentRef.current;
    try {
      let linkedTuId = tutoiementTemplateId;
      if (tutoiementDraft.enabled) {
        const tuCorpsHtml = canonicalizeCorpsHtmlForSave(tutoiementDraft.corpsHtml);
        const tuPlain = htmlToPlainEmail(tuCorpsHtml);
        const tuNom = buildTutoiementTemplateNom(formData.nom);
        const tuPayload: NewTemplateEmail = {
          nom: tuNom,
          sujet: tutoiementDraft.sujet.trim(),
          corps: tuPlain,
          categorie: formData.categorie,
          variables: stampStelliumPerfTemplateMeta(
            stampScpiBulletinTemplateMeta(
              setTemplateCorpsHtmlInMeta(tutoiementVariables, tuCorpsHtml || null),
              tuNom
            ),
            tuNom
          ),
          agenda_link_id: formData.agenda_link_id,
          relance_template_id: null,
          tutoiement_template_id: null,
        };
        if (linkedTuId != null) {
          await updateTemplateEmail(linkedTuId, tuPayload);
        } else {
          const createdTu = await createTemplateEmail(tuPayload);
          linkedTuId = createdTu.id;
        }
      }

      let linkedRelanceId = relanceTemplateId;
      if (relanceDraft.enabled && !relanceDraft.useSameMessage) {
        const relCorpsHtml = canonicalizeCorpsHtmlForSave(relanceDraft.corpsHtml);
        const relPlain = htmlToPlainEmail(relCorpsHtml);
        const relNom = buildRelanceTemplateNom(formData.nom);
        let linkedRelanceTuId = relanceTuTemplateId;
        if (tutoiementDraft.enabled) {
          const relTuCorpsHtml = canonicalizeCorpsHtmlForSave(relanceTuDraft.corpsHtml);
          const relTuPlain = htmlToPlainEmail(relTuCorpsHtml);
          const relTuPayload: NewTemplateEmail = {
            nom: buildTutoiementTemplateNom(relNom),
            sujet: relanceTuDraft.sujet.trim(),
            corps: relTuPlain,
            categorie: "RELANCE",
            variables: setTemplateCorpsHtmlInMeta(null, relTuCorpsHtml || null),
            agenda_link_id: formData.agenda_link_id,
            relance_template_id: null,
            tutoiement_template_id: null,
          };
          if (linkedRelanceTuId != null) {
            await updateTemplateEmail(linkedRelanceTuId, relTuPayload);
          } else {
            const createdRelTu = await createTemplateEmail(relTuPayload);
            linkedRelanceTuId = createdRelTu.id;
          }
        }
        const relPayload: NewTemplateEmail = {
          nom: relNom,
          sujet: relanceDraft.sujet.trim(),
          corps: relPlain,
          categorie: "RELANCE",
          variables: setTemplateCorpsHtmlInMeta(null, relCorpsHtml || null),
          agenda_link_id: formData.agenda_link_id,
          relance_template_id: null,
          tutoiement_template_id: tutoiementDraft.enabled ? linkedRelanceTuId : null,
        };
        if (linkedRelanceId != null) {
          await updateTemplateEmail(linkedRelanceId, relPayload);
        } else {
          const createdRel = await createTemplateEmail(relPayload);
          linkedRelanceId = createdRel.id;
        }
      }

      let variables = setTemplateCorpsHtmlInMeta(formData.variables, corpsHtmlForSave || null);
      let ephemeralCampaignSaved = ephemeralCampaign;
      if (isEphemeralMode) {
        let campaignForSave = ephemeralCampaign;
        if (effectiveTemplateId != null) {
          try {
            const fresh = await getTemplateEmailById(effectiveTemplateId);
            campaignForSave = mergeEphemeralCampaignForSave(
              ephemeralCampaign,
              parseEphemeralCampaignConfig(fresh.variables)
            );
          } catch {
            // garde l'état local
          }
        }
        ephemeralCampaignSaved = {
          ...campaignForSave,
          audience: ephemeralCampaign.audience,
          excluded_contact_ids: ephemeralCampaign.excluded_contact_ids,
          send_at: ephemeralCampaign.send_at,
        };
        const baseVars =
          effectiveTemplateId == null
            ? stampNewEphemeralTemplateMeta(variables)
            : variables;
        variables = setEphemeralCampaignInMeta(
          baseVars,
          ephemeralCampaignSaved,
          { isEphemeral: true }
        );
        variables = setTemplateEmailTriggerInMeta(variables, DEFAULT_TEMPLATE_EMAIL_TRIGGER);
      } else {
        variables = setTemplateEmailTriggerInMeta(variables, emailTrigger);
      }
      const relanceEnabled = relanceDraft.enabled;
      variables = setTemplateEmailRelanceInMeta(variables, {
        enabled: relanceEnabled,
        delai_jours: relanceEnabled ? relanceDraft.delaiJours : null,
        envoi_heure:
          relanceEnabled && relanceDraft.envoiHeure.trim()
            ? relanceDraft.envoiHeure.trim()
            : null,
        envoi_jours_semaine: relanceEnabled
          ? serializeEmailEnvoiJoursSemaine(relanceDraft.envoiJours)
          : null,
      });
      variables = setTemplateEmailSuiviReponseInMeta(variables, {
        attendre_reponse: relanceEnabled ? relanceDraft.attendreReponse : false,
      });
      variables = stampStelliumPerfTemplateMeta(
        stampScpiBulletinTemplateMeta(variables, formData.nom),
        formData.nom
      );

      const payload: NewTemplateEmail = {
        ...formData,
        corps: plainCorps,
        variables,
        relance_template_id: relanceDraft.enabled
          ? relanceDraft.useSameMessage
            ? null
            : linkedRelanceId
          : null,
        tutoiement_template_id: tutoiementDraft.enabled ? linkedTuId : null,
      };

      const existingId = effectiveTemplateId;
      let templateId = existingId;
      if (existingId != null) {
        await updateTemplateEmail(existingId, payload);
        if (!isEphemeralMode || saveIntentAtStart === "default") {
          toast.success(isEphemeralMode ? "Campagne enregistrée" : "Modèle enregistré");
        }
      } else {
        const created = await createTemplateEmail(payload);
        templateId = created.id;
        if (!isEphemeralMode || saveIntentAtStart === "default") {
          toast.success(isEphemeralMode ? "Campagne enregistrée" : "Modèle créé");
        }
      }
      if (templateId != null) {
        setPersistedTemplateId(templateId);
      }
      if (isEphemeralMode) {
        setConfirmAbandonOnClose(false);
        setEphemeralCampaign(ephemeralCampaignSaved);
        setLastSavedEphemeralFingerprint(
          buildEphemeralSyncFingerprint({
            nom: formData.nom,
            sujet: formData.sujet,
            corpsHtml: corpsHtmlForSave,
            agenda_link_id: formData.agenda_link_id ?? null,
            campaign: ephemeralCampaignSaved,
          })
        );
        ephemeralSaveIntentRef.current = "default";
        saveBeforeSyncRef.current?.resolve();
        saveBeforeSyncRef.current = null;
      }
      if (templateId != null && !isEphemeralMode) {
        await setTemplateEtiquetteLinks(templateId, linkedEtiquetteIds);
        notifyEtiquettesChanged();
      }
      await onSuccess?.();
      if (isEphemeralMode) {
        if (saveIntentAtStart === "default") {
          setFormTab("destinataires");
        }
        return;
      }
    } catch (error) {
      console.error("Error saving template:", error);
      saveBeforeSyncRef.current?.reject(error);
      saveBeforeSyncRef.current = null;
      ephemeralSaveIntentRef.current = "default";
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  const applyCorpsHtml = (html: string) => {
    const normalized = sanitizeTemplateEmailHtml(html.trim());
    setCorpsHtml(normalized);
    setFormData((prev) => ({
      ...prev,
      corps: htmlToPlainEmail(normalized),
      variables: setTemplateCorpsHtmlInMeta(prev.variables, normalized || null),
    }));
  };

  const captureSujetSelection = useCallback(() => {
    const el = sujetInputRef.current;
    if (!el) return;
    sujetSelectionRef.current = {
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onSelectionChange = () => {
      if (sujetInputRef.current === document.activeElement) {
        captureSujetSelection();
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [open, captureSujetSelection]);

  const captureSelectionsBeforeVariableInsert = () => {
    if (sujetInputRef.current === document.activeElement) {
      captureSujetSelection();
    }
    if (richEditorRef.current?.contains(document.activeElement)) {
      editorSelectionRef.current = saveRichEditorSelection(richEditorRef.current);
    }
  };

  const handleVariableInsert = (
    event: React.MouseEvent,
    variable: string,
    field: "sujet" | "corps"
  ) => {
    event.preventDefault();
    captureSelectionsBeforeVariableInsert();
    insertVariable(variable, field);
  };

  const insertVariable = (variable: string, field: "sujet" | "corps") => {
    if (field === "corps") {
      const html = insertTextInRichEditor(
        richEditorRef.current,
        variable,
        editorSelectionRef.current
      );
      applyCorpsHtml(html);
      richEditorRef.current?.focus();
      return;
    }
    const sujetInput = sujetInputRef.current;
    const selection =
      sujetInput === document.activeElement && sujetInput
        ? {
            start: sujetInput.selectionStart ?? formData.sujet.length,
            end: sujetInput.selectionEnd ?? formData.sujet.length,
          }
        : { ...sujetSelectionRef.current };

    const { value, caret } = insertTextInPlainField(formData.sujet, variable, selection);
    sujetSelectionRef.current = { start: caret, end: caret };
    flushSync(() => {
      setFormData((prev) => ({ ...prev, sujet: value }));
    });
    const input = sujetInputRef.current;
    if (input) {
      input.focus();
      input.setSelectionRange(caret, caret);
    }
  };

  const toggleEtiquetteLink = (id: number) => {
    setLinkedEtiquetteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const requestEphemeralSave = useCallback((): Promise<void> => {
    if (saveBeforeSyncRef.current) {
      return Promise.reject(new Error("Enregistrement déjà en cours"));
    }
    return new Promise((resolve, reject) => {
      saveBeforeSyncRef.current = { resolve, reject };
      ephemeralSaveIntentRef.current = "sync";
      formRef.current?.requestSubmit();
    });
  }, []);

  const requestEphemeralSaveForTab = useCallback((): Promise<void> => {
    if (effectiveTemplateId != null && !needsSaveBeforeEphemeralSync) {
      return Promise.resolve();
    }
    if (saveBeforeSyncRef.current) {
      return Promise.reject(new Error("Enregistrement déjà en cours"));
    }
    return new Promise((resolve, reject) => {
      saveBeforeSyncRef.current = { resolve, reject };
      ephemeralSaveIntentRef.current = "tab";
      formRef.current?.requestSubmit();
    });
  }, [effectiveTemplateId, needsSaveBeforeEphemeralSync]);

  const handleFormTabChange = useCallback(
    (next: FormTab) => {
      if (next === formTab) return;
      if (
        next === "destinataires" &&
        isEphemeralMode &&
        (effectiveTemplateId == null || needsSaveBeforeEphemeralSync)
      ) {
        setDestinatairesTabPending(true);
        void requestEphemeralSaveForTab()
          .then(() => setFormTab("destinataires"))
          .catch(() => undefined)
          .finally(() => setDestinatairesTabPending(false));
        return;
      }
      setFormTab(next);
    },
    [
      formTab,
      isEphemeralMode,
      effectiveTemplateId,
      needsSaveBeforeEphemeralSync,
      requestEphemeralSaveForTab,
    ]
  );

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true);
        else handleRequestClose();
      }}
    >
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle>
            {template
              ? isEphemeralMode
                ? "Campagne éphémère"
                : "Modifier le modèle"
              : isEphemeralMode
                ? "Nouvelle campagne éphémère"
                : "Nouveau modèle"}
          </DialogTitle>
          <DialogDescription>
            {isEphemeralMode
              ? "Message, cible produits, exclusions — suivi et relance comme un modèle classique."
              : "Message, déclencheur, étiquettes et mise en forme — aperçu à droite."}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
            <div className="flex-1 min-h-0 flex flex-col min-w-0">
              <Tabs
                value={formTab}
                onValueChange={(v) => handleFormTabChange(v as FormTab)}
                className="flex flex-col flex-1 min-h-0"
              >
                <TabsList
                  className={cn(
                    "mx-6 mt-4 grid w-auto shrink-0",
                    isEphemeralMode ? "grid-cols-5" : "grid-cols-5"
                  )}
                >
                  <TabsTrigger value="message">Message</TabsTrigger>
                  <TabsTrigger value="tutoiement">
                    Tutoiement
                    {tutoiementDraft.enabled && (
                      <span className="ml-1.5 text-[10px] text-violet-700">on</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="relance">
                    Relance
                    {relanceDraft.enabled && (
                      <span className="ml-1.5 text-[10px] text-orange-700">on</span>
                    )}
                  </TabsTrigger>
                  {isEphemeralMode ? (
                    <>
                      <TabsTrigger value="audience">Audience</TabsTrigger>
                      <TabsTrigger value="destinataires" disabled={destinatairesTabPending}>
                        Destinataires
                        {destinatairesTabPending ? (
                          <Loader2 className="ml-1.5 h-3 w-3 animate-spin" />
                        ) : null}
                      </TabsTrigger>
                    </>
                  ) : (
                    <>
                      <TabsTrigger value="declencheur">
                        Déclencheur
                        {emailTrigger.enabled && (
                          <span className="ml-1.5 text-[10px] text-primary">on</span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="liaisons">
                        Étiquettes
                        {linkedEtiquetteIds.length > 0 && (
                          <span className="ml-1.5 text-[10px] text-primary">
                            ({linkedEtiquetteIds.length})
                          </span>
                        )}
                      </TabsTrigger>
                    </>
                  )}
                </TabsList>

                <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                  <TabsContent value="message" className="mt-0 space-y-4 data-[state=inactive]:hidden">
                    <div className="space-y-2">
                      <Label htmlFor="nom">Nom du modèle *</Label>
                      <Input
                        id="nom"
                        value={formData.nom}
                        onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                        placeholder="Ex. Rappel déclaration IR"
                        autoFocus
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Intention</Label>
                      <CategoryTogglePills
                        categories={categoryPills}
                        selected={[formData.categorie]}
                        single
                        onToggle={(value) => setFormData({ ...formData, categorie: value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        {getTemplateCategoryMeta(formData.categorie).label} — pour retrouver le
                        modèle dans la bibliothèque.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sujet">Objet *</Label>
                      <Input
                        ref={sujetInputRef}
                        id="sujet"
                        value={formData.sujet}
                        onChange={(e) => setFormData({ ...formData, sujet: e.target.value })}
                        onSelect={captureSujetSelection}
                        onKeyUp={captureSujetSelection}
                        onClick={captureSujetSelection}
                        onFocus={captureSujetSelection}
                        onBlur={captureSujetSelection}
                        placeholder="Ex. {{prenom}}, votre déclaration d'impôts"
                      />
                    </div>

                    <details className="group rounded-lg border bg-muted/20" open>
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                        Variables à insérer
                        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
                      </summary>
                      <div
                        className="px-3 pb-3 space-y-2 border-t"
                        onMouseDownCapture={captureSelectionsBeforeVariableInsert}
                      >
                        <div className="flex flex-wrap gap-2 pt-2">
                          {EMAIL_TEMPLATE_VARIABLES.map((v) => (
                            <span key={v.token} className="inline-flex gap-0.5">
                              <Badge
                                variant="outline"
                                className="cursor-pointer hover:bg-primary hover:text-primary-foreground rounded-r-none text-[11px]"
                                title={`${v.label} → message`}
                                onMouseDown={(event) =>
                                  handleVariableInsert(event, v.token, "corps")
                                }
                              >
                                {v.token}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="cursor-pointer rounded-l-none text-[10px] px-1"
                                title="→ objet"
                                onMouseDown={(event) =>
                                  handleVariableInsert(event, v.token, "sujet")
                                }
                              >
                                obj
                              </Badge>
                            </span>
                          ))}
                          {agendaVariables.map((v) => (
                            <span key={v.token} className="inline-flex gap-0.5">
                              <Badge
                                variant="outline"
                                className="cursor-pointer rounded-r-none text-[11px] border-amber-300"
                                onMouseDown={(event) =>
                                  handleVariableInsert(event, v.token, "corps")
                                }
                              >
                                {v.token}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="cursor-pointer rounded-l-none text-[10px] px-1"
                                onMouseDown={(event) =>
                                  handleVariableInsert(event, v.token, "sujet")
                                }
                              >
                                obj
                              </Badge>
                            </span>
                          ))}
                          {stelliumVariables.map((v) => (
                            <span key={v.token} className="inline-flex gap-0.5">
                              <Badge
                                variant="outline"
                                className="cursor-pointer rounded-r-none text-[11px] border-emerald-300 bg-emerald-50/50"
                                title={`${v.label} — ${v.hint}`}
                                onMouseDown={(event) =>
                                  handleVariableInsert(event, v.token, "corps")
                                }
                              >
                                {v.token}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="cursor-pointer rounded-l-none text-[10px] px-1"
                                title="→ objet"
                                onMouseDown={(event) =>
                                  handleVariableInsert(event, v.token, "sujet")
                                }
                              >
                                obj
                              </Badge>
                            </span>
                          ))}
                        </div>
                        {stelliumVariables.length > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            Perf Stellium : composez le message en HTML (gras, puces…) ; seuls les
                            chiffres viennent des variables vertes à la préparation.
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          Curseur dans l&apos;objet ou le message : clic variable → corps, « obj
                          » → objet.
                        </p>
                      </div>
                    </details>

                    <div className="space-y-2">
                      <Label htmlFor="corps">Message *</Label>
                      <RichTextEmailEditor
                        ref={richEditorRef}
                        value={corpsHtml}
                        onChange={applyCorpsHtml}
                        onSelectionSave={(range) => {
                          editorSelectionRef.current = range;
                        }}
                        minHeight="240px"
                      />
                    </div>

                    {isEphemeralMode && agendaLinks.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="agenda-link-ephemeral">Lien Google Agenda</Label>
                        <Select
                          value={formData.agenda_link_id ?? "__none__"}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              agenda_link_id: value === "__none__" ? null : value,
                            })
                          }
                        >
                          <SelectTrigger id="agenda-link-ephemeral">
                            <SelectValue placeholder="Choisir un lien" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Aucun</SelectItem>
                            {agendaLinks.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Pour {"{{lien_agenda}}"} dans le message — liens définis dans Paramètres
                          → Profil.
                        </p>
                      </div>
                    )}

                    <div className="space-y-2 lg:hidden">
                      <Label>Aperçu sur</Label>
                      <Select value={previewContactId} onValueChange={setPreviewContactId}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sample">Contact fictif (Marie Dupont)</SelectItem>
                          {contacts.slice(0, 200).map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.prenom} {c.nom}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <TemplateEmailPreviewPanel
                        sujet={formData.sujet}
                        corps={formData.corps}
                        corpsHtml={corpsHtml}
                        templateNom={formData.nom}
                        templateVariables={formData.variables}
                        cgp={cgp}
                        agendaLinkId={formData.agenda_link_id}
                        contact={previewContact}
                        tutoiement={previewTutoiement}
                        previewRegistre={previewContact ? undefined : previewRegistre}
                        allowSendTest
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="tutoiement" className="mt-0 data-[state=inactive]:hidden">
                    <TemplateEmailTutoiementPanel
                      draft={tutoiementDraft}
                      onChange={setTutoiementDraft}
                      parentNom={formData.nom}
                    />
                  </TabsContent>

                  <TabsContent value="relance" className="mt-0 data-[state=inactive]:hidden">
                    <TemplateEmailRelancePanel
                      draft={relanceDraft}
                      onChange={(next) => {
                        setRelanceDraft(next);
                        if (
                          tutoiementDraft.enabled &&
                          !next.useSameMessage &&
                          !relanceTuDraft.sujet &&
                          !relanceTuDraft.corpsHtml
                        ) {
                          setRelanceTuDraft((prev) => ({ ...prev, enabled: true }));
                        }
                      }}
                      parentNom={formData.nom}
                      fallbackDelaiJours={DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS}
                      mainTutoiementEnabled={tutoiementDraft.enabled}
                      tutoiementDraft={relanceTuDraft}
                      onTutoiementChange={setRelanceTuDraft}
                    />
                  </TabsContent>

                  <TabsContent value="declencheur" className="mt-0 data-[state=inactive]:hidden">
                    {souscriptionDuplicateWarning && (
                      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                        {souscriptionDuplicateWarning}
                      </p>
                    )}
                    <TemplateEmailTriggerPanel
                      trigger={emailTrigger}
                      onChange={setEmailTrigger}
                    />
                  </TabsContent>

                  <TabsContent value="liaisons" className="mt-0 space-y-5 data-[state=inactive]:hidden">
                    {souscriptionDuplicateWarning && (
                      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        {souscriptionDuplicateWarning}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground rounded-lg border px-3 py-2 bg-muted/30">
                      Optionnel : liez des étiquettes pour les campagnes « classiques » (règles
                      auto sur les fiches). Le déclencheur du modèle fonctionne sans créer
                      d&apos;étiquette.
                    </p>
                    <div className="space-y-2">
                      <Label>Étiquettes qui envoient ce modèle</Label>
                      <p className="text-xs text-muted-foreground">
                        Équivalent au choix du modèle sur chaque étiquette (onglet Email). Les
                        étiquettes cochées utiliseront ce template en campagne.
                      </p>
                      {etiquettes.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">Aucune étiquette.</p>
                      ) : (
                        <CategoryTogglePills
                          categories={etiquettes.map((e) => ({
                            value: String(e.id),
                            label: e.nom,
                          }))}
                          selected={linkedEtiquetteIds.map(String)}
                          onToggle={(value) => toggleEtiquetteLink(parseInt(value, 10))}
                        />
                      )}
                    </div>

                    {agendaLinks.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="agenda-link">Lien Google Agenda</Label>
                        <Select
                          value={formData.agenda_link_id ?? "__none__"}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              agenda_link_id: value === "__none__" ? null : value,
                            })
                          }
                        >
                          <SelectTrigger id="agenda-link">
                            <SelectValue placeholder="Choisir un lien" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Aucun</SelectItem>
                            {agendaLinks.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Pour {"{{lien_agenda}}"} dans le message — liens définis dans Paramètres
                          → Profil.
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {isEphemeralMode && (
                    <>
                      <TabsContent value="audience" className="mt-0 data-[state=inactive]:hidden">
                        <TemplateEmailEphemeralAudiencePanel
                          audience={ephemeralCampaign.audience}
                          sendAt={ephemeralCampaign.send_at}
                          onAudienceChange={(audience) =>
                            setEphemeralCampaign((prev) => ({ ...prev, audience }))
                          }
                          onSendAtChange={(send_at) =>
                            setEphemeralCampaign((prev) => ({ ...prev, send_at }))
                          }
                          highlightInvalid={ephemeralAudienceInvalid}
                        />
                      </TabsContent>
                      <TabsContent
                        value="destinataires"
                        className="mt-0 data-[state=inactive]:hidden"
                      >
                        <TemplateEmailEphemeralRecipientsPanel
                          templateId={effectiveTemplateId}
                          excludedContactIds={ephemeralCampaign.excluded_contact_ids}
                          needsSaveBeforeSync={needsSaveBeforeEphemeralSync}
                          bootstrapPending={destinatairesTabPending || loading}
                          onRequestSave={requestEphemeralSave}
                          onExcludedChange={(excluded_contact_ids) =>
                            setEphemeralCampaign((prev) => ({ ...prev, excluded_contact_ids }))
                          }
                          campaignStatus={ephemeralCampaign.status}
                          onCampaignUpdated={async () => {
                            const id = effectiveTemplateId;
                            if (id == null) return;
                            const fresh = await getTemplateEmailById(id);
                            const cfg = parseEphemeralCampaignConfig(fresh.variables);
                            if (cfg) {
                              setEphemeralCampaign(cfg);
                              if (cfg.status === "archived") {
                                await onSuccess?.();
                                onOpenChange(false);
                              }
                            }
                          }}
                        />
                      </TabsContent>
                    </>
                  )}
                </div>
              </Tabs>
            </div>

            <aside
              className={cn(
                "hidden lg:flex flex-col w-[300px] shrink-0 border-l bg-muted/15",
                "p-4 gap-3 overflow-y-auto"
              )}
            >
              <Label className="text-xs text-muted-foreground">Aperçu en direct</Label>
              <Select value={previewContactId} onValueChange={setPreviewContactId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sample">Marie Dupont (exemple)</SelectItem>
                  {contacts.slice(0, 200).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.prenom} {c.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!previewContact && tutoiementDraft.enabled && (
                <Select
                  value={previewRegistre}
                  onValueChange={(v) => setPreviewRegistre(v as "VOUS" | "TU")}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VOUS">Aperçu vouvoiement</SelectItem>
                    <SelectItem value="TU">Aperçu tutoiement</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <TemplateEmailPreviewPanel
                sujet={formData.sujet}
                corps={formData.corps}
                corpsHtml={corpsHtml}
                templateNom={formData.nom}
                templateVariables={formData.variables}
                cgp={cgp}
                agendaLinkId={formData.agenda_link_id}
                contact={previewContact}
                tutoiement={previewTutoiement}
                previewRegistre={previewContact ? undefined : previewRegistre}
                label=""
                allowSendTest
              />
            </aside>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={handleRequestClose}>
              {shouldConfirmAbandonEphemeral() ? "Abandonner" : "Annuler"}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={abandonConfirmOpen} onOpenChange={setAbandonConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Abandonner cette campagne ?</AlertDialogTitle>
          <AlertDialogDescription>
            La campagne sera retirée de la bibliothèque. Les envois non effectués déjà en file
            seront annulés. L&apos;historique des envois déjà partis reste sur les fiches contact.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={abandoning}>Continuer la préparation</AlertDialogCancel>
          <AlertDialogAction
            disabled={abandoning}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void handleConfirmAbandon();
            }}
          >
            {abandoning ? "Abandon…" : "Abandonner la campagne"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
