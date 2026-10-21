import { useState, useEffect, useMemo, useRef, useCallback, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { buildAgendaTemplateVariables, findUnresolvedAgendaTokens } from "@/lib/emails/agenda-links";
import { TemplateEmailAttachmentSaveContext } from "@/components/emails/template-email-attachment-save-context";
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
  readRichTextEditorHtml,
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
  deleteDetachedTemplateChildren,
  getAllTemplatesEmail,
  getTemplateEmailAction,
  setTemplateEmailAction,
  type NewTemplateEmail,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import type { TacheActionPriorite } from "@/lib/api/tauri-etiquettes";
import { notifyTachesChanged } from "@/lib/taches/tache-events";
import { validateEtiquetteTacheAction } from "@/lib/etiquettes/etiquette-form-validation";
import { TemplateEmailTacheActionPanel } from "@/components/emails/TemplateEmailTacheActionPanel";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { stampScpiBulletinTemplateMeta } from "@/lib/emails/scpi-template-meta";
import { stampStelliumPerfTemplateMeta } from "@/lib/emails/stellium-template-meta";

type VariableInsertTarget = "main" | "tutoiement" | "relance" | "relanceTu";
import {
  TemplateEmailRelancePanel,
  type TemplateRelanceDraft,
} from "@/components/emails/TemplateEmailRelancePanel";
import {
  TemplateEmailPlacementConformePanel,
  type TemplatePlacementConformeDraft,
} from "@/components/emails/TemplateEmailPlacementConformePanel";
import {
  TemplateEmailPipeRdvPanel,
  type TemplatePipeRdvDraft,
} from "@/components/emails/TemplateEmailPipeRdvPanel";
import {
  DEFAULT_PLACEMENT_CONFORME_TRIGGER,
  findPlacementConformeStelliumLabelOverlapError,
  parseTemplateEmailPlacementConformeTrigger,
  setTemplateEmailPlacementConformeTriggerInMeta,
} from "@/lib/emails/template-email-placement-conforme";
import {
  TemplateEmailTutoiementPanel,
  type TemplateTutoiementDraft,
} from "@/components/emails/TemplateEmailTutoiementPanel";
import { buildTutoiementTemplateNom } from "@/lib/emails/template-email-formality";
import { parseTemplateEmailMeta } from "@/lib/emails/template-email-html";
import {
  findOrphanAttachments,
  findRemovedAttachments,
  mergeAttachmentsIntoVariables,
  parseTemplateEmailAttachments,
  setTemplateEmailAttachmentsInMeta,
  type TemplateEmailAttachmentMeta,
} from "@/lib/emails/template-email-attachments";
import { TemplateEmailAttachmentsPanel } from "@/components/emails/TemplateEmailAttachmentsPanel";
import { removeTemplateEmailAttachment } from "@/lib/api/tauri-template-email-attachments";
import { useTemplateChildAttachments } from "@/hooks/useTemplateChildAttachments";
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
  buildPipeRdvFollowUpTemplateNom,
  buildPipeRdvReminderTemplateNom,
  DEFAULT_PIPE_RDV_FOLLOW_UP,
  DEFAULT_PIPE_RDV_FOLLOW_UP_CORPS_HTML,
  DEFAULT_PIPE_RDV_FOLLOW_UP_CORPS_HTML_TU,
  DEFAULT_PIPE_RDV_FOLLOW_UP_SUJET,
  DEFAULT_PIPE_RDV_FOLLOW_UP_SUJET_TU,
  DEFAULT_PIPE_RDV_REMINDER,
  DEFAULT_PIPE_RDV_REMINDER_CORPS_HTML,
  DEFAULT_PIPE_RDV_REMINDER_CORPS_HTML_TU,
  DEFAULT_PIPE_RDV_REMINDER_SUJET,
  DEFAULT_PIPE_RDV_REMINDER_SUJET_TU,
  DEFAULT_PIPE_RDV_TRIGGER,
  findPipeRdvStageOverlapError,
  parseTemplateEmailPipeRdvFollowUp,
  parseTemplateEmailPipeRdvReminder,
  parseTemplateEmailPipeRdvTrigger,
  setTemplateEmailPipeRdvFollowUpInMeta,
  setTemplateEmailPipeRdvReminderInMeta,
  setTemplateEmailPipeRdvTriggerInMeta,
} from "@/lib/emails/template-email-pipe-rdv";
import {
  serializeEmailEnvoiJoursSemaine,
} from "@/lib/emails/email-envoi-schedule";
import {
  parseTemplateEmailSuiviReponse,
  TEMPLATE_EMAIL_SUIVI_REPONSE_KEY,
  setTemplateEmailSuiviReponseInMeta,
} from "@/lib/emails/template-email-suivi-reponse";
import { getAllEtiquettes, type Etiquette } from "@/lib/api/tauri-etiquettes";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { archiveEphemeralCampaign } from "@/lib/api/tauri-ephemeral-campaign";
import {
  EMAIL_TEMPLATE_CATEGORIES,
  getTemplateCategoryMeta,
  normalizeAgendaLinks,
  type EmailTemplateCategory,
} from "@/lib/emails/template-email-meta";
import { TemplateEmailVariableField } from "@/components/emails/TemplateEmailVariableField";
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
import {
  parseConditionIrNetConfig,
  parseConditionRevenusAnnuelsConfig,
  parseConditionTmiConfig,
} from "@/lib/etiquettes/fiscal-tmi";
import { isTriggerRuleTreeValid } from "@/lib/emails/template-email-trigger-rule-tree";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TemplateEmailEphemeralAudiencePanel } from "@/components/emails/TemplateEmailEphemeralAudiencePanel";
import { TemplateEmailEphemeralRecipientsPanel } from "@/components/emails/TemplateEmailEphemeralRecipientsPanel";
import {
  DEFAULT_EPHEMERAL_CAMPAIGN,
  buildEphemeralSyncFingerprint,
  isEphemeralAudienceValid,
  isEphemeralSegmentAudience,
  shouldShowEphemeralPatrimoineFilter,
  isEphemeralTemplate,
  mergeEphemeralCampaignForSave,
  parseEphemeralCampaignConfig,
  setEphemeralCampaignInMeta,
  stampEphemeralAuxiliaryTemplateMeta,
  stampNewEphemeralTemplateMeta,
  type EphemeralCampaignConfig,
} from "@/lib/emails/template-email-ephemeral";
import { TeamLockBanner } from "@/components/team/TeamLockBanner";
import { useTeamFormRecordLock } from "@/hooks/useTeamFormRecordLock";

export type TemplateEmailFormMode = "permanent" | "ephemeral";

interface TemplateEmailFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateEmail | null;
  formMode?: TemplateEmailFormMode;
  /** `keepOpen` : enregistrement fait pour continuer (ex. joindre un fichier) — ne pas fermer. */
  onSuccess?: (options?: { keepOpen?: boolean }) => void | Promise<void>;
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
    | "pipe-rdv"
    | "placement-conforme"
    | "declencheur"
    | "liaisons"
    | "action"
    | "audience"
    | "destinataires";
  const [loading, setLoading] = useState(false);
  const teamLock = useTeamFormRecordLock({
    open,
    onOpenChange,
    entityType: "templates_email",
    entityId: template?.id,
  });
  const [formTab, setFormTab] = useState<FormTab>("message");
  const [relanceDraft, setRelanceDraft] = useState<TemplateRelanceDraft>({
    enabled: false,
    useSameMessage: true,
    sujet: "",
    corpsHtml: "",
    attendreReponse: true,
    delaiJours: DEFAULT_TEMPLATE_EMAIL_RELANCE.delai_jours ?? DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS,
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
  const [pipeRdvDraft, setPipeRdvDraft] = useState<TemplatePipeRdvDraft>({
    trigger: { ...DEFAULT_PIPE_RDV_TRIGGER },
    reminder: { ...DEFAULT_PIPE_RDV_REMINDER },
    followUp: { ...DEFAULT_PIPE_RDV_FOLLOW_UP },
    reminderSujet: "",
    reminderCorpsHtml: "",
    reminderTuSujet: "",
    reminderTuCorpsHtml: "",
    followUpSujet: "",
    followUpCorpsHtml: "",
    followUpTuSujet: "",
    followUpTuCorpsHtml: "",
  });
  const [pipeRdvReminderTemplateId, setPipeRdvReminderTemplateId] = useState<number | null>(
    null
  );
  const [pipeRdvReminderTuTemplateId, setPipeRdvReminderTuTemplateId] = useState<number | null>(
    null
  );
  const [pipeRdvFollowUpTemplateId, setPipeRdvFollowUpTemplateId] = useState<number | null>(
    null
  );
  const [pipeRdvFollowUpTuTemplateId, setPipeRdvFollowUpTuTemplateId] = useState<number | null>(
    null
  );
  const [placementConformeDraft, setPlacementConformeDraft] =
    useState<TemplatePlacementConformeDraft>({
      trigger: { ...DEFAULT_PLACEMENT_CONFORME_TRIGGER },
    });
  const [previewRegistre, setPreviewRegistre] = useState<"VOUS" | "TU">("VOUS");
  const [emailTrigger, setEmailTrigger] = useState<TemplateEmailTriggerConfig>(
    DEFAULT_TEMPLATE_EMAIL_TRIGGER
  );
  const [cgp, setCgp] = useState<Awaited<ReturnType<typeof getCgpConfig>> | null>(null);
  const [previewContactId, setPreviewContactId] = useState<string>("sample");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>([]);
  const [linkedEtiquetteIds, setLinkedEtiquetteIds] = useState<number[]>([]);
  const [tacheActif, setTacheActif] = useState(false);
  const [tacheTitre, setTacheTitre] = useState("");
  const [tachePriorite, setTachePriorite] = useState<TacheActionPriorite>("NORMALE");
  const [tacheDelaiJours, setTacheDelaiJours] = useState(0);
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
  const tuRichEditorRef = useRef<HTMLDivElement>(null);
  const tuSujetInputRef = useRef<HTMLInputElement>(null);
  const relanceSujetInputRef = useRef<HTMLInputElement>(null);
  const relanceRichEditorRef = useRef<HTMLDivElement>(null);
  const relanceTuSujetInputRef = useRef<HTMLInputElement>(null);
  const relanceTuRichEditorRef = useRef<HTMLDivElement>(null);
  const sujetInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const ephemeralSaveIntentRef = useRef<"default" | "sync" | "tab">("default");
  const openedWithTemplateIdRef = useRef<number | null>(null);
  const [confirmAbandonOnClose, setConfirmAbandonOnClose] = useState(false);
  const [destinatairesTabPending, setDestinatairesTabPending] = useState(false);
  const [abandonConfirmOpen, setAbandonConfirmOpen] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  // Modifié à la main depuis l'ouverture ou le dernier enregistrement (fermeture sans perte).
  const [dirty, setDirty] = useState(false);
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false);
  const [etiquetteReplaceConfirm, setEtiquetteReplaceConfirm] = useState<{
    etiquetteId: number;
    etiquetteNom: string;
    currentTemplateNom: string;
  } | null>(null);
  const [templateNames, setTemplateNames] = useState<Map<number, string>>(() => new Map());
  const [invalidFields, setInvalidFields] = useState<ReadonlySet<"nom" | "sujet" | "corps">>(
    () => new Set()
  );
  const clearInvalid = (field: "nom" | "sujet" | "corps") =>
    setInvalidFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  const keepOpenAfterSaveRef = useRef(false);
  const lastSubmitOkRef = useRef(false);
  // Pas deux enregistrements en parallèle (Ctrl+S répété, clic pendant l'enregistrement).
  const savingRef = useRef(false);
  // Modification faite pendant un enregistrement : elle reste « non enregistrée ».
  const dirtyVersionRef = useRef(0);
  const markDirty = useCallback(() => {
    dirtyVersionRef.current += 1;
    setDirty(true);
  }, []);
  const saveBeforeSyncRef = useRef<{
    resolve: () => void;
    reject: (reason?: unknown) => void;
  } | null>(null);
  const sujetSelectionRef = useRef({ start: 0, end: 0 });
  const tuSujetSelectionRef = useRef({ start: 0, end: 0 });
  const relanceSujetSelectionRef = useRef({ start: 0, end: 0 });
  const relanceTuSujetSelectionRef = useRef({ start: 0, end: 0 });
  const editorSelectionRef = useRef<Range | null>(null);
  const tuEditorSelectionRef = useRef<Range | null>(null);
  const relanceEditorSelectionRef = useRef<Range | null>(null);
  const relanceTuEditorSelectionRef = useRef<Range | null>(null);
  const [attachments, setAttachments] = useState<TemplateEmailAttachmentMeta[]>([]);
  const baselineAttachmentsRef = useRef<TemplateEmailAttachmentMeta[]>([]);
  const hydrateActionRequestRef = useRef(0);
  /** Version d'hydratation : une réponse tardive d'un autre modèle est ignorée. */
  const hydrateRequestRef = useRef(0);
  const tutoiementAttachmentsState = useTemplateChildAttachments();
  const relanceAttachmentsState = useTemplateChildAttachments();
  const relanceTuAttachmentsState = useTemplateChildAttachments();
  const pipeReminderAttachmentsState = useTemplateChildAttachments();
  const pipeReminderTuAttachmentsState = useTemplateChildAttachments();
  const pipeFollowUpAttachmentsState = useTemplateChildAttachments();
  const pipeFollowUpTuAttachmentsState = useTemplateChildAttachments();
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
    const hydrateId = ++hydrateRequestRef.current;
    const isStale = () => hydrateId !== hydrateRequestRef.current;
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
    setAttachments(parseTemplateEmailAttachments(source.variables));
    baselineAttachmentsRef.current = parseTemplateEmailAttachments(source.variables);
    setEmailTrigger(parseTemplateEmailTrigger(source.variables));
    setRelanceTemplateId(source.relance_template_id);
    setTutoiementTemplateId(source.tutoiement_template_id ?? null);
    setTutoiementVariables(null);
    tutoiementAttachmentsState.reset();
    const hasTu = source.tutoiement_template_id != null;
    setTutoiementDraft({
      enabled: hasTu,
      sujet: "",
      corpsHtml: "",
    });
    if (hasTu && source.tutoiement_template_id) {
      void getTemplateEmailById(source.tutoiement_template_id)
        .then((tu) => {
          if (isStale()) return;
          const tuHtml = getTemplateCorpsHtml(tu.variables);
          setTutoiementVariables(tu.variables);
          tutoiementAttachmentsState.hydrate(tu.variables);
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
    const hasRelanceMeta = TEMPLATE_EMAIL_RELANCE_KEY in meta;
    // Clé absente = même règle que le Rust (relance active sauf campagne éphémère),
    // sinon un simple « Enregistrer » coupait la relance des modèles par défaut.
    const relanceEnabled = hasRelanceMeta
      ? relanceCfg.enabled
      : (hasDedicated || !isEphemeralTemplate(source.variables)) &&
        source.categorie !== "NEWSLETTER";
    setRelanceDraft({
      enabled: relanceEnabled,
      useSameMessage: !hasDedicated,
      sujet: "",
      corpsHtml: "",
      // Clé absente : même défaut que le Rust (oui, sauf campagne éphémère).
      attendreReponse:
        TEMPLATE_EMAIL_SUIVI_REPONSE_KEY in meta
          ? parseTemplateEmailSuiviReponse(source.variables).attendre_reponse
          : !isEphemeralTemplate(source.variables),
      delaiJours: relanceCfg.delai_jours ?? DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS,
      // Pas d'heure enregistrée = pas de créneau côté Rust : ne pas en inventer une.
      envoiHeure: hasRelanceMeta ? relanceCfg.envoi_heure ?? "" : "",
      envoiJours: relanceJoursFromConfig(relanceCfg.envoi_jours_semaine),
    });
    // Le formulaire reste monté d'un modèle à l'autre : repartir d'une relance tu vierge,
    // sinon l'id et le texte du modèle précédent seraient réécrits à l'enregistrement.
    setRelanceTuTemplateId(null);
    setRelanceTuDraft({ enabled: false, sujet: "", corpsHtml: "" });
    if (!hasDedicated) {
      relanceAttachmentsState.reset();
      relanceTuAttachmentsState.reset();
    }
    if (hasDedicated && source.relance_template_id) {
      void getTemplateEmailById(source.relance_template_id)
        .then((rel) => {
          if (isStale()) return;
          const relHtml = getTemplateCorpsHtml(rel.variables);
          setRelanceDraft((prev) => ({
            ...prev,
            sujet: rel.sujet,
            corpsHtml: relHtml ?? plainTextToTemplateHtml(rel.corps),
          }));
          relanceAttachmentsState.hydrate(rel.variables);
          const relTuId = rel.tutoiement_template_id ?? null;
          setRelanceTuTemplateId(relTuId);
          if (relTuId != null) {
            void getTemplateEmailById(relTuId)
              .then((relTu) => {
                if (isStale()) return;
                const relTuHtml = getTemplateCorpsHtml(relTu.variables);
                setRelanceTuDraft({
                  enabled: true,
                  sujet: relTu.sujet,
                  corpsHtml: relTuHtml ?? plainTextToTemplateHtml(relTu.corps),
                });
                relanceTuAttachmentsState.hydrate(relTu.variables);
              })
              .catch(() => undefined);
          } else {
            setRelanceTuDraft({ enabled: false, sujet: "", corpsHtml: "" });
            relanceTuAttachmentsState.reset();
          }
        })
        .catch(() => undefined);
    }
    const pipeTrigger = parseTemplateEmailPipeRdvTrigger(source.variables);
    const pipeReminder = parseTemplateEmailPipeRdvReminder(source.variables);
    const pipeFollowUp = parseTemplateEmailPipeRdvFollowUp(source.variables);
    setPipeRdvDraft({
      trigger: pipeTrigger,
      reminder: pipeReminder,
      followUp: pipeFollowUp,
      reminderSujet: "",
      reminderCorpsHtml: "",
      reminderTuSujet: "",
      reminderTuCorpsHtml: "",
      followUpSujet: "",
      followUpCorpsHtml: "",
      followUpTuSujet: "",
      followUpTuCorpsHtml: "",
    });
    setPipeRdvReminderTemplateId(pipeReminder.reminder_template_id);
    setPipeRdvReminderTuTemplateId(pipeReminder.reminder_tutoiement_template_id);
    setPipeRdvFollowUpTemplateId(pipeFollowUp.follow_up_template_id);
    setPipeRdvFollowUpTuTemplateId(pipeFollowUp.follow_up_tutoiement_template_id);
    setPlacementConformeDraft({
      trigger: parseTemplateEmailPlacementConformeTrigger(source.variables),
    });
    if (!pipeReminder.reminder_template_id) {
      pipeReminderAttachmentsState.reset();
      pipeReminderTuAttachmentsState.reset();
    }
    if (!pipeFollowUp.follow_up_template_id) {
      pipeFollowUpAttachmentsState.reset();
      pipeFollowUpTuAttachmentsState.reset();
    }
    if (pipeReminder.reminder_template_id) {
      void getTemplateEmailById(pipeReminder.reminder_template_id)
        .then((rem) => {
          if (isStale()) return;
          const remHtml = getTemplateCorpsHtml(rem.variables);
          setPipeRdvDraft((prev) => ({
            ...prev,
            reminderSujet: rem.sujet,
            reminderCorpsHtml: remHtml ?? plainTextToTemplateHtml(rem.corps),
          }));
          pipeReminderAttachmentsState.hydrate(rem.variables);
          const remTuId = rem.tutoiement_template_id ?? null;
          setPipeRdvReminderTuTemplateId(remTuId);
          if (remTuId != null) {
            void getTemplateEmailById(remTuId)
              .then((remTu) => {
                if (isStale()) return;
                const remTuHtml = getTemplateCorpsHtml(remTu.variables);
                setPipeRdvDraft((prev) => ({
                  ...prev,
                  reminderTuSujet: remTu.sujet,
                  reminderTuCorpsHtml: remTuHtml ?? plainTextToTemplateHtml(remTu.corps),
                }));
                pipeReminderTuAttachmentsState.hydrate(remTu.variables);
              })
              .catch(() => undefined);
          } else {
            pipeReminderTuAttachmentsState.reset();
          }
        })
        .catch(() => undefined);
    }
    if (pipeFollowUp.follow_up_template_id) {
      void getTemplateEmailById(pipeFollowUp.follow_up_template_id)
        .then((followUp) => {
          if (isStale()) return;
          const followUpHtml = getTemplateCorpsHtml(followUp.variables);
          setPipeRdvDraft((prev) => ({
            ...prev,
            followUpSujet: followUp.sujet,
            followUpCorpsHtml: followUpHtml ?? plainTextToTemplateHtml(followUp.corps),
          }));
          pipeFollowUpAttachmentsState.hydrate(followUp.variables);
          const followUpTuId = followUp.tutoiement_template_id ?? null;
          setPipeRdvFollowUpTuTemplateId(followUpTuId);
          if (followUpTuId != null) {
            void getTemplateEmailById(followUpTuId)
              .then((followUpTu) => {
                if (isStale()) return;
                const followUpTuHtml = getTemplateCorpsHtml(followUpTu.variables);
                setPipeRdvDraft((prev) => ({
                  ...prev,
                  followUpTuSujet: followUpTu.sujet,
                  followUpTuCorpsHtml:
                    followUpTuHtml ?? plainTextToTemplateHtml(followUpTu.corps),
                }));
                pipeFollowUpTuAttachmentsState.hydrate(followUpTu.variables);
              })
              .catch(() => undefined);
          } else {
            pipeFollowUpTuAttachmentsState.reset();
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
    setTacheActif(false);
    setTacheTitre("");
    setTachePriorite("NORMALE");
    setTacheDelaiJours(0);
    const actionRequestId = ++hydrateActionRequestRef.current;
    void getTemplateEmailAction(source.id)
      .then((action) => {
        if (actionRequestId !== hydrateActionRequestRef.current) return;
        if (!action) return;
        setTacheActif(action.tache_actif);
        setTacheTitre(action.tache_titre ?? "");
        setTachePriorite(
          action.tache_priorite === "BASSE" || action.tache_priorite === "HAUTE"
            ? action.tache_priorite
            : "NORMALE"
        );
        setTacheDelaiJours(Math.max(0, action.tache_delai_jours));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate une fois ; états PJ enfants via méthodes stables du hook
  }, []);

  const resetCreateForm = useCallback(() => {
    const ephemeralDefaults = isEphemeralMode;
    setFormData({
      nom: "",
      sujet: "",
      corps: "",
      categorie: ephemeralDefaults ? "EPHEMERE" : "RELANCE",
      variables: null,
      agenda_link_id: null,
      relance_template_id: null,
      tutoiement_template_id: null,
    });
    setCorpsHtml("");
    setAttachments([]);
    baselineAttachmentsRef.current = [];
    tutoiementAttachmentsState.reset();
    relanceAttachmentsState.reset();
    relanceTuAttachmentsState.reset();
    pipeReminderAttachmentsState.reset();
    pipeReminderTuAttachmentsState.reset();
    pipeFollowUpAttachmentsState.reset();
    pipeFollowUpTuAttachmentsState.reset();
    setEmailTrigger(DEFAULT_TEMPLATE_EMAIL_TRIGGER);
    setRelanceDraft({
      enabled: false,
      useSameMessage: true,
      sujet: "",
      corpsHtml: "",
      attendreReponse: !ephemeralDefaults,
      delaiJours: DEFAULT_TEMPLATE_EMAIL_RELANCE.delai_jours ?? DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS,
      envoiHeure: DEFAULT_TEMPLATE_EMAIL_RELANCE.envoi_heure ?? "18:30",
      envoiJours: null,
    });
    setRelanceTemplateId(null);
    setTutoiementDraft({ enabled: false, sujet: "", corpsHtml: "" });
    setTutoiementTemplateId(null);
    setTutoiementVariables(null);
    setRelanceTuDraft({ enabled: false, sujet: "", corpsHtml: "" });
    setRelanceTuTemplateId(null);
    setPipeRdvDraft({
      trigger: { ...DEFAULT_PIPE_RDV_TRIGGER },
      reminder: { ...DEFAULT_PIPE_RDV_REMINDER },
      followUp: { ...DEFAULT_PIPE_RDV_FOLLOW_UP },
      reminderSujet: "",
      reminderCorpsHtml: "",
      reminderTuSujet: "",
      reminderTuCorpsHtml: "",
      followUpSujet: "",
      followUpCorpsHtml: "",
      followUpTuSujet: "",
      followUpTuCorpsHtml: "",
    });
    setPipeRdvReminderTemplateId(null);
    setPipeRdvReminderTuTemplateId(null);
    setPipeRdvFollowUpTemplateId(null);
    setPipeRdvFollowUpTuTemplateId(null);
    setPlacementConformeDraft({
      trigger: { ...DEFAULT_PLACEMENT_CONFORME_TRIGGER },
    });
    setPreviewRegistre("VOUS");
    setPreviewContactId("sample");
    setLinkedEtiquetteIds([]);
    setTacheActif(false);
    setTacheTitre("");
    setTachePriorite("NORMALE");
    setTacheDelaiJours(0);
    setEphemeralCampaign({ ...DEFAULT_EPHEMERAL_CAMPAIGN });
    setEphemeralAudienceInvalid(false);
    setLastSavedEphemeralFingerprint(null);
    setConfirmAbandonOnClose(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset initial ; PJ enfants via méthodes stables du hook
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
    setDirty(false);
    setUnsavedConfirmOpen(false);
    setInvalidFields(new Set());
    setFormTab("message");
    void getCgpConfig().then(setCgp).catch(() => setCgp(null));
    void getAllContacts()
      .then((list) => setContacts(list.filter((c) => c.email?.trim())))
      .catch(() => setContacts([]));
    void getAllEtiquettes().then(setEtiquettes).catch(() => setEtiquettes([]));
    void getAllTemplatesEmail()
      .then((list) => setTemplateNames(new Map(list.map((t) => [t.id, t.nom]))))
      .catch(() => setTemplateNames(new Map()));
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
    const tuTemplateId = tutoiementTemplateId ?? 0;
    const variables =
      tuTemplateId > 0
        ? tutoiementAttachmentsState.mergeIntoVariables(tutoiementVariables, tuTemplateId)
        : tutoiementVariables;
    return {
      sujet: tutoiementDraft.sujet,
      corps: plain || formData.corps,
      corpsHtml: tutoiementDraft.corpsHtml,
      variables,
    };
  }, [
    tutoiementDraft,
    formData.corps,
    tutoiementVariables,
    tutoiementTemplateId,
    tutoiementAttachmentsState,
  ]);

  const handlePipeRdvDraftChange = useCallback(
    (next: TemplatePipeRdvDraft) => {
      setPipeRdvDraft((prev) => {
        let updated = next;
        if (
          prev.reminder.use_same_message &&
          !next.reminder.use_same_message &&
          !next.reminderSujet.trim() &&
          !htmlToPlainEmail(next.reminderCorpsHtml).trim()
        ) {
          updated = {
            ...updated,
            reminderSujet: DEFAULT_PIPE_RDV_REMINDER_SUJET,
            reminderCorpsHtml: DEFAULT_PIPE_RDV_REMINDER_CORPS_HTML,
            reminderTuSujet: next.reminderTuSujet.trim()
              ? next.reminderTuSujet
              : DEFAULT_PIPE_RDV_REMINDER_SUJET_TU,
            reminderTuCorpsHtml: htmlToPlainEmail(next.reminderTuCorpsHtml).trim()
              ? next.reminderTuCorpsHtml
              : DEFAULT_PIPE_RDV_REMINDER_CORPS_HTML_TU,
          };
        }
        if (
          prev.followUp.use_same_message &&
          !next.followUp.use_same_message &&
          !next.followUpSujet.trim() &&
          !htmlToPlainEmail(next.followUpCorpsHtml).trim()
        ) {
          updated = {
            ...updated,
            followUpSujet: DEFAULT_PIPE_RDV_FOLLOW_UP_SUJET,
            followUpCorpsHtml: DEFAULT_PIPE_RDV_FOLLOW_UP_CORPS_HTML,
            followUpTuSujet: next.followUpTuSujet.trim()
              ? next.followUpTuSujet
              : DEFAULT_PIPE_RDV_FOLLOW_UP_SUJET_TU,
            followUpTuCorpsHtml: htmlToPlainEmail(next.followUpTuCorpsHtml).trim()
              ? next.followUpTuCorpsHtml
              : DEFAULT_PIPE_RDV_FOLLOW_UP_CORPS_HTML_TU,
          };
        }
        return updated;
      });
    },
    []
  );

  const pipeRdvReminderTuFilled = useCallback((draft: TemplatePipeRdvDraft) => {
    return Boolean(
      draft.reminderTuSujet.trim() || htmlToPlainEmail(draft.reminderTuCorpsHtml).trim()
    );
  }, []);

  const pipeRdvFollowUpTuFilled = useCallback((draft: TemplatePipeRdvDraft) => {
    return Boolean(
      draft.followUpTuSujet.trim() || htmlToPlainEmail(draft.followUpTuCorpsHtml).trim()
    );
  }, []);

  const agendaLinks = useMemo(() => normalizeAgendaLinks(cgp), [cgp]);

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

  /** Jetons d'agenda du message qui partiraient vides (lien supprimé ou introuvable). */
  const unresolvedAgendaTokens = useMemo(() => {
    if (!cgp) return [];
    // Message principal, version tutoiement et relance dédiée (même lien d'agenda à l'envoi).
    const texts = [formData.sujet, corpsHtml];
    if (tutoiementDraft.enabled) texts.push(tutoiementDraft.sujet, tutoiementDraft.corpsHtml);
    if (relanceDraft.enabled && !relanceDraft.useSameMessage) {
      texts.push(relanceDraft.sujet, relanceDraft.corpsHtml);
    }
    return findUnresolvedAgendaTokens(
      texts.join("\n"),
      buildAgendaTemplateVariables(cgp, formData.agenda_link_id)
    );
  }, [cgp, formData.sujet, formData.agenda_link_id, corpsHtml, tutoiementDraft, relanceDraft]);

  const previewVariables = useMemo(() => {
    if (effectiveTemplateId == null) return formData.variables;
    return mergeAttachmentsIntoVariables(formData.variables, attachments, effectiveTemplateId);
  }, [formData.variables, attachments, effectiveTemplateId]);

  const closeForm = useCallback(() => {
    const templateId = effectiveTemplateId;
    if (templateId != null) {
      const orphans = findOrphanAttachments(attachments, baselineAttachmentsRef.current);
      void Promise.all(
        orphans.map((att) =>
          removeTemplateEmailAttachment(templateId, att.stored_name).catch(() => undefined)
        )
      );
    }
    tutoiementAttachmentsState.discardOrphans(tutoiementTemplateId);
    relanceAttachmentsState.discardOrphans(relanceTemplateId);
    relanceTuAttachmentsState.discardOrphans(relanceTuTemplateId);
    pipeReminderAttachmentsState.discardOrphans(pipeRdvReminderTemplateId);
    pipeReminderTuAttachmentsState.discardOrphans(pipeRdvReminderTuTemplateId);
    pipeFollowUpAttachmentsState.discardOrphans(pipeRdvFollowUpTemplateId);
    pipeFollowUpTuAttachmentsState.discardOrphans(pipeRdvFollowUpTuTemplateId);
    rejectPendingEphemeralSave(new Error("closed"));
    onOpenChange(false);
  }, [
    onOpenChange,
    effectiveTemplateId,
    attachments,
    tutoiementTemplateId,
    relanceTemplateId,
    relanceTuTemplateId,
    pipeRdvReminderTemplateId,
    pipeRdvReminderTuTemplateId,
    pipeRdvFollowUpTemplateId,
    pipeRdvFollowUpTuTemplateId,
    tutoiementAttachmentsState,
    relanceAttachmentsState,
    relanceTuAttachmentsState,
    pipeReminderAttachmentsState,
    pipeReminderTuAttachmentsState,
    pipeFollowUpAttachmentsState,
    pipeFollowUpTuAttachmentsState,
  ]);

  const handleRequestClose = useCallback(() => {
    if (shouldConfirmAbandonEphemeral()) {
      setAbandonConfirmOpen(true);
      return;
    }
    if (dirty) {
      setUnsavedConfirmOpen(true);
      return;
    }
    closeForm();
  }, [shouldConfirmAbandonEphemeral, closeForm, dirty]);

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

  const categoryPills = EMAIL_TEMPLATE_CATEGORIES.filter((c) => c.id !== "EPHEMERE").map((c) => ({
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
    lastSubmitOkRef.current = false;
    if (savingRef.current) return;
    if (!teamLock.ready) {
      toast.message("Modèle en cours d'ouverture — réessayez dans un instant.");
      return;
    }
    savingRef.current = true;
    try {
      await submitTemplate();
    } finally {
      savingRef.current = false;
    }
  };

  const submitTemplate = async () => {
    const versionAtStart = dirtyVersionRef.current;
    const corpsHtmlForSave = canonicalizeCorpsHtmlForSave(corpsHtml);
    const plainCorps = htmlToPlainEmail(corpsHtmlForSave) || formData.corps.trim();
    const missing = new Set<"nom" | "sujet" | "corps">();
    if (!formData.nom.trim()) missing.add("nom");
    if (!formData.sujet.trim()) missing.add("sujet");
    if (!plainCorps) missing.add("corps");
    setInvalidFields(missing);
    if (missing.size > 0) {
      const labels = { nom: "nom du modèle", sujet: "objet", corps: "message" } as const;
      toast.error(`À compléter : ${[...missing].map((f) => labels[f]).join(", ")}`);
      setFormTab("message");
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
    if (!isEphemeralMode && pipeRdvDraft.trigger.enabled && pipeRdvDraft.trigger.stages.length === 0) {
      toast.error("Pipe RDV : sélectionnez au moins une étape (onglet Pipe RDV)");
      setFormTab("pipe-rdv");
      rejectPendingEphemeralSave(new Error("validation"));
      return;
    }
    if (!isEphemeralMode && pipeRdvDraft.trigger.enabled) {
      const overlap = await findPipeRdvStageOverlapError(
        effectiveTemplateId,
        pipeRdvDraft.trigger.stages
      );
      if (overlap) {
        toast.error(overlap);
        setFormTab("pipe-rdv");
        rejectPendingEphemeralSave(new Error("validation"));
        return;
      }
    }
    if (
      !isEphemeralMode &&
      placementConformeDraft.trigger.enabled &&
      placementConformeDraft.trigger.stellium_labels.length === 0
    ) {
      toast.error(
        "Box Placement : sélectionnez au moins un acte (onglet Box Placement)"
      );
      setFormTab("placement-conforme");
      rejectPendingEphemeralSave(new Error("validation"));
      return;
    }
    const tacheError = validateEtiquetteTacheAction(tacheTitre, tacheActif);
    if (tacheError) {
      toast.error(tacheError.message);
      setFormTab("action");
      rejectPendingEphemeralSave(new Error("validation"));
      return;
    }
    if (!isEphemeralMode && placementConformeDraft.trigger.enabled) {
      const overlap = await findPlacementConformeStelliumLabelOverlapError(
        effectiveTemplateId,
        placementConformeDraft.trigger.stellium_labels
      );
      if (overlap) {
        toast.error(overlap);
        setFormTab("placement-conforme");
        rejectPendingEphemeralSave(new Error("validation"));
        return;
      }
    }
    if (
      !isEphemeralMode &&
      pipeRdvDraft.trigger.enabled &&
      pipeRdvDraft.reminder.enabled &&
      !pipeRdvDraft.reminder.use_same_message
    ) {
      const remPlain = htmlToPlainEmail(pipeRdvDraft.reminderCorpsHtml);
      if (!pipeRdvDraft.reminderSujet.trim() || !remPlain) {
        toast.error("Rappel RDV : renseignez l'objet et le message (onglet Pipe RDV)");
        setFormTab("pipe-rdv");
        rejectPendingEphemeralSave(new Error("validation"));
        return;
      }
      if (tutoiementDraft.enabled) {
        const remTuPlain = htmlToPlainEmail(pipeRdvDraft.reminderTuCorpsHtml);
        if (!pipeRdvDraft.reminderTuSujet.trim() || !remTuPlain) {
          toast.error(
            "Rappel RDV : renseignez aussi l'objet et le message tutoiement (onglet Pipe RDV)"
          );
          setFormTab("pipe-rdv");
          rejectPendingEphemeralSave(new Error("validation"));
          return;
        }
      } else if (pipeRdvReminderTuFilled(pipeRdvDraft)) {
        const remTuPlain = htmlToPlainEmail(pipeRdvDraft.reminderTuCorpsHtml);
        if (!pipeRdvDraft.reminderTuSujet.trim() || !remTuPlain) {
          toast.error(
            "Rappel RDV : complétez objet et message tutoiement, ou videz la variante tu"
          );
          setFormTab("pipe-rdv");
          rejectPendingEphemeralSave(new Error("validation"));
          return;
        }
      }
    }
    if (
      !isEphemeralMode &&
      pipeRdvDraft.trigger.enabled &&
      pipeRdvDraft.followUp.enabled &&
      !pipeRdvDraft.followUp.use_same_message
    ) {
      const followUpPlain = htmlToPlainEmail(pipeRdvDraft.followUpCorpsHtml);
      if (!pipeRdvDraft.followUpSujet.trim() || !followUpPlain) {
        toast.error("Suivi RDV : renseignez l'objet et le message (onglet Pipe RDV)");
        setFormTab("pipe-rdv");
        rejectPendingEphemeralSave(new Error("validation"));
        return;
      }
      if (tutoiementDraft.enabled) {
        const followUpTuPlain = htmlToPlainEmail(pipeRdvDraft.followUpTuCorpsHtml);
        if (!pipeRdvDraft.followUpTuSujet.trim() || !followUpTuPlain) {
          toast.error(
            "Suivi RDV : renseignez aussi l'objet et le message tutoiement (onglet Pipe RDV)"
          );
          setFormTab("pipe-rdv");
          rejectPendingEphemeralSave(new Error("validation"));
          return;
        }
      } else if (pipeRdvFollowUpTuFilled(pipeRdvDraft)) {
        const followUpTuPlain = htmlToPlainEmail(pipeRdvDraft.followUpTuCorpsHtml);
        if (!pipeRdvDraft.followUpTuSujet.trim() || !followUpTuPlain) {
          toast.error(
            "Suivi RDV : complétez objet et message tutoiement, ou videz la variante tu"
          );
          setFormTab("pipe-rdv");
          rejectPendingEphemeralSave(new Error("validation"));
          return;
        }
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
    if (emailTrigger.enabled && emailTrigger.condition_type === "TMI") {
      const cfg = parseConditionTmiConfig(emailTrigger.condition_config);
      if (!cfg || cfg.tranches.length === 0) {
        toast.error("Déclencheur : sélectionnez au moins une tranche TMI");
        setFormTab("declencheur");
        rejectPendingEphemeralSave(new Error("validation"));
        return;
      }
    }
    if (
      emailTrigger.enabled &&
      (emailTrigger.condition_type === "IR_NET" ||
        emailTrigger.condition_type === "REVENUS_ANNUELS")
    ) {
      const cfg =
        emailTrigger.condition_type === "IR_NET"
          ? parseConditionIrNetConfig(emailTrigger.condition_config)
          : parseConditionRevenusAnnuelsConfig(emailTrigger.condition_config);
      if (!cfg || !Number.isFinite(cfg.montant) || cfg.montant <= 0) {
        toast.error("Déclencheur : renseignez un montant valide");
        setFormTab("declencheur");
        rejectPendingEphemeralSave(new Error("validation"));
        return;
      }
    }
    if (emailTrigger.enabled && emailTrigger.condition_type === "RULE_TREE") {
      if (!isTriggerRuleTreeValid(emailTrigger.condition_config)) {
        toast.error("Déclencheur : complétez toutes les conditions de la règle combinée");
        setFormTab("declencheur");
        rejectPendingEphemeralSave(new Error("validation"));
        return;
      }
    }
    if (isEphemeralMode && !isEphemeralAudienceValid(ephemeralCampaign.audience)) {
      const aud = ephemeralCampaign.audience;
      if (isEphemeralSegmentAudience(aud)) {
        toast.error("Audience : choisissez un segment actif");
      } else {
        const needsProducts = shouldShowEphemeralPatrimoineFilter(aud.categories);
        toast.error(
          needsProducts
            ? "Audience : sélectionnez un patrimoine (type/nom produit) ou une règle avancée (TMI, revenus…)"
            : "Audience : sélectionnez au moins une catégorie de contact"
        );
      }
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
        const tuRawHtml =
          readRichTextEditorHtml(tuRichEditorRef.current) || tutoiementDraft.corpsHtml;
        const tuCorpsHtml = canonicalizeCorpsHtmlForSave(tuRawHtml);
        const tuPlain = htmlToPlainEmail(tuCorpsHtml);
        const tuNom = buildTutoiementTemplateNom(formData.nom);
        let tuVariables = stampStelliumPerfTemplateMeta(
          stampScpiBulletinTemplateMeta(
            setTemplateCorpsHtmlInMeta(tutoiementVariables, tuCorpsHtml || null),
            tuNom
          ),
          tuNom
        );
        if (isEphemeralMode) {
          tuVariables = stampEphemeralAuxiliaryTemplateMeta(tuVariables);
        }
        const tuPayload: NewTemplateEmail = {
          nom: tuNom,
          sujet: tutoiementDraft.sujet.trim(),
          corps: tuPlain,
          categorie: formData.categorie,
          variables: tuVariables,
          agenda_link_id: formData.agenda_link_id,
          relance_template_id: null,
          tutoiement_template_id: null,
        };
        if (linkedTuId != null) {
          await updateTemplateEmail(linkedTuId, {
            ...tuPayload,
            variables: tutoiementAttachmentsState.mergeIntoVariables(
              tuPayload.variables,
              linkedTuId
            ),
          });
        } else {
          const createdTu = await createTemplateEmail(tuPayload);
          linkedTuId = createdTu.id;
          const tuVariablesWithAttachments = tutoiementAttachmentsState.mergeIntoVariables(
            tuPayload.variables,
            linkedTuId
          );
          if (tuVariablesWithAttachments !== tuPayload.variables) {
            await updateTemplateEmail(linkedTuId, {
              ...tuPayload,
              variables: tuVariablesWithAttachments,
            });
          }
        }
        await tutoiementAttachmentsState.removeDeletedOnSave(linkedTuId);
        tutoiementAttachmentsState.commitBaseline();
        setTutoiementTemplateId(linkedTuId);
        setTutoiementDraft((prev) => ({ ...prev, corpsHtml: tuCorpsHtml }));
        setTutoiementVariables(
          tutoiementAttachmentsState.mergeIntoVariables(
            setTemplateCorpsHtmlInMeta(tutoiementVariables, tuCorpsHtml || null),
            linkedTuId
          )
        );
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
            await updateTemplateEmail(linkedRelanceTuId, {
              ...relTuPayload,
              variables: relanceTuAttachmentsState.mergeIntoVariables(
                relTuPayload.variables,
                linkedRelanceTuId
              ),
            });
          } else {
            const createdRelTu = await createTemplateEmail(relTuPayload);
            linkedRelanceTuId = createdRelTu.id;
            const relTuVariablesWithAttachments = relanceTuAttachmentsState.mergeIntoVariables(
              relTuPayload.variables,
              linkedRelanceTuId
            );
            if (relTuVariablesWithAttachments !== relTuPayload.variables) {
              await updateTemplateEmail(linkedRelanceTuId, {
                ...relTuPayload,
                variables: relTuVariablesWithAttachments,
              });
            }
          }
          await relanceTuAttachmentsState.removeDeletedOnSave(linkedRelanceTuId);
          relanceTuAttachmentsState.commitBaseline();
          setRelanceTuTemplateId(linkedRelanceTuId);
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
          await updateTemplateEmail(linkedRelanceId, {
            ...relPayload,
            variables: relanceAttachmentsState.mergeIntoVariables(
              relPayload.variables,
              linkedRelanceId
            ),
          });
        } else {
          const createdRel = await createTemplateEmail(relPayload);
          linkedRelanceId = createdRel.id;
          const relVariablesWithAttachments = relanceAttachmentsState.mergeIntoVariables(
            relPayload.variables,
            linkedRelanceId
          );
          if (relVariablesWithAttachments !== relPayload.variables) {
            await updateTemplateEmail(linkedRelanceId, {
              ...relPayload,
              variables: relVariablesWithAttachments,
            });
          }
        }
        await relanceAttachmentsState.removeDeletedOnSave(linkedRelanceId);
        relanceAttachmentsState.commitBaseline();
        setRelanceTemplateId(linkedRelanceId);
      }

      let linkedPipeRdvReminderId = pipeRdvReminderTemplateId;
      let linkedPipeRdvReminderTuId = pipeRdvReminderTuTemplateId;
      if (
        !isEphemeralMode &&
        pipeRdvDraft.trigger.enabled &&
        pipeRdvDraft.reminder.enabled &&
        !pipeRdvDraft.reminder.use_same_message
      ) {
        const remCorpsHtml = canonicalizeCorpsHtmlForSave(pipeRdvDraft.reminderCorpsHtml);
        const remPlain = htmlToPlainEmail(remCorpsHtml);
        const remNom = buildPipeRdvReminderTemplateNom(formData.nom);
        const shouldSaveReminderTu =
          tutoiementDraft.enabled || pipeRdvReminderTuFilled(pipeRdvDraft);
        if (shouldSaveReminderTu) {
          const remTuCorpsHtml = canonicalizeCorpsHtmlForSave(pipeRdvDraft.reminderTuCorpsHtml);
          const remTuPlain = htmlToPlainEmail(remTuCorpsHtml);
          const remTuPayload: NewTemplateEmail = {
            nom: buildTutoiementTemplateNom(remNom),
            sujet: pipeRdvDraft.reminderTuSujet.trim(),
            corps: remTuPlain,
            categorie: "RELANCE",
            variables: setTemplateCorpsHtmlInMeta(null, remTuCorpsHtml || null),
            agenda_link_id: formData.agenda_link_id,
            relance_template_id: null,
            tutoiement_template_id: null,
          };
          if (linkedPipeRdvReminderTuId != null) {
            await updateTemplateEmail(linkedPipeRdvReminderTuId, {
              ...remTuPayload,
              variables: pipeReminderTuAttachmentsState.mergeIntoVariables(
                remTuPayload.variables,
                linkedPipeRdvReminderTuId
              ),
            });
          } else if (remTuPlain) {
            const createdRemTu = await createTemplateEmail(remTuPayload);
            linkedPipeRdvReminderTuId = createdRemTu.id;
            const remTuVariablesWithAttachments = pipeReminderTuAttachmentsState.mergeIntoVariables(
              remTuPayload.variables,
              linkedPipeRdvReminderTuId
            );
            if (remTuVariablesWithAttachments !== remTuPayload.variables) {
              await updateTemplateEmail(linkedPipeRdvReminderTuId, {
                ...remTuPayload,
                variables: remTuVariablesWithAttachments,
              });
            }
          }
          if (linkedPipeRdvReminderTuId != null) {
            await pipeReminderTuAttachmentsState.removeDeletedOnSave(linkedPipeRdvReminderTuId);
            pipeReminderTuAttachmentsState.commitBaseline();
          }
        } else if (linkedPipeRdvReminderTuId != null) {
          linkedPipeRdvReminderTuId = null;
          pipeReminderTuAttachmentsState.reset();
        }
        const remPayload: NewTemplateEmail = {
          nom: remNom,
          sujet: pipeRdvDraft.reminderSujet.trim(),
          corps: remPlain,
          categorie: "RELANCE",
          variables: setTemplateCorpsHtmlInMeta(null, remCorpsHtml || null),
          agenda_link_id: formData.agenda_link_id,
          relance_template_id: null,
          tutoiement_template_id: linkedPipeRdvReminderTuId,
        };
        if (linkedPipeRdvReminderId != null) {
          await updateTemplateEmail(linkedPipeRdvReminderId, {
            ...remPayload,
            variables: pipeReminderAttachmentsState.mergeIntoVariables(
              remPayload.variables,
              linkedPipeRdvReminderId
            ),
          });
        } else {
          const createdRem = await createTemplateEmail(remPayload);
          linkedPipeRdvReminderId = createdRem.id;
          const remVariablesWithAttachments = pipeReminderAttachmentsState.mergeIntoVariables(
            remPayload.variables,
            linkedPipeRdvReminderId
          );
          if (remVariablesWithAttachments !== remPayload.variables) {
            await updateTemplateEmail(linkedPipeRdvReminderId, {
              ...remPayload,
              variables: remVariablesWithAttachments,
            });
          }
        }
        await pipeReminderAttachmentsState.removeDeletedOnSave(linkedPipeRdvReminderId);
        pipeReminderAttachmentsState.commitBaseline();
        setPipeRdvReminderTemplateId(linkedPipeRdvReminderId);
        setPipeRdvReminderTuTemplateId(linkedPipeRdvReminderTuId);
      }

      let linkedPipeRdvFollowUpId = pipeRdvFollowUpTemplateId;
      let linkedPipeRdvFollowUpTuId = pipeRdvFollowUpTuTemplateId;
      if (
        !isEphemeralMode &&
        pipeRdvDraft.trigger.enabled &&
        pipeRdvDraft.followUp.enabled &&
        !pipeRdvDraft.followUp.use_same_message
      ) {
        const followUpCorpsHtml = canonicalizeCorpsHtmlForSave(pipeRdvDraft.followUpCorpsHtml);
        const followUpPlain = htmlToPlainEmail(followUpCorpsHtml);
        const followUpNom = buildPipeRdvFollowUpTemplateNom(formData.nom);
        const shouldSaveFollowUpTu =
          tutoiementDraft.enabled || pipeRdvFollowUpTuFilled(pipeRdvDraft);
        if (shouldSaveFollowUpTu) {
          const followUpTuCorpsHtml = canonicalizeCorpsHtmlForSave(pipeRdvDraft.followUpTuCorpsHtml);
          const followUpTuPlain = htmlToPlainEmail(followUpTuCorpsHtml);
          const followUpTuPayload: NewTemplateEmail = {
            nom: buildTutoiementTemplateNom(followUpNom),
            sujet: pipeRdvDraft.followUpTuSujet.trim(),
            corps: followUpTuPlain,
            categorie: "RELANCE",
            variables: setTemplateCorpsHtmlInMeta(null, followUpTuCorpsHtml || null),
            agenda_link_id: formData.agenda_link_id,
            relance_template_id: null,
            tutoiement_template_id: null,
          };
          if (linkedPipeRdvFollowUpTuId != null) {
            await updateTemplateEmail(linkedPipeRdvFollowUpTuId, {
              ...followUpTuPayload,
              variables: pipeFollowUpTuAttachmentsState.mergeIntoVariables(
                followUpTuPayload.variables,
                linkedPipeRdvFollowUpTuId
              ),
            });
          } else if (followUpTuPlain) {
            const createdFollowUpTu = await createTemplateEmail(followUpTuPayload);
            linkedPipeRdvFollowUpTuId = createdFollowUpTu.id;
            const followUpTuVariablesWithAttachments =
              pipeFollowUpTuAttachmentsState.mergeIntoVariables(
                followUpTuPayload.variables,
                linkedPipeRdvFollowUpTuId
              );
            if (followUpTuVariablesWithAttachments !== followUpTuPayload.variables) {
              await updateTemplateEmail(linkedPipeRdvFollowUpTuId, {
                ...followUpTuPayload,
                variables: followUpTuVariablesWithAttachments,
              });
            }
          }
          if (linkedPipeRdvFollowUpTuId != null) {
            await pipeFollowUpTuAttachmentsState.removeDeletedOnSave(linkedPipeRdvFollowUpTuId);
            pipeFollowUpTuAttachmentsState.commitBaseline();
          }
        } else if (linkedPipeRdvFollowUpTuId != null) {
          linkedPipeRdvFollowUpTuId = null;
          pipeFollowUpTuAttachmentsState.reset();
        }
        const followUpPayload: NewTemplateEmail = {
          nom: followUpNom,
          sujet: pipeRdvDraft.followUpSujet.trim(),
          corps: followUpPlain,
          categorie: "RELANCE",
          variables: setTemplateCorpsHtmlInMeta(null, followUpCorpsHtml || null),
          agenda_link_id: formData.agenda_link_id,
          relance_template_id: null,
          tutoiement_template_id: linkedPipeRdvFollowUpTuId,
        };
        if (linkedPipeRdvFollowUpId != null) {
          await updateTemplateEmail(linkedPipeRdvFollowUpId, {
            ...followUpPayload,
            variables: pipeFollowUpAttachmentsState.mergeIntoVariables(
              followUpPayload.variables,
              linkedPipeRdvFollowUpId
            ),
          });
        } else {
          const createdFollowUp = await createTemplateEmail(followUpPayload);
          linkedPipeRdvFollowUpId = createdFollowUp.id;
          const followUpVariablesWithAttachments = pipeFollowUpAttachmentsState.mergeIntoVariables(
            followUpPayload.variables,
            linkedPipeRdvFollowUpId
          );
          if (followUpVariablesWithAttachments !== followUpPayload.variables) {
            await updateTemplateEmail(linkedPipeRdvFollowUpId, {
              ...followUpPayload,
              variables: followUpVariablesWithAttachments,
            });
          }
        }
        await pipeFollowUpAttachmentsState.removeDeletedOnSave(linkedPipeRdvFollowUpId);
        pipeFollowUpAttachmentsState.commitBaseline();
        setPipeRdvFollowUpTemplateId(linkedPipeRdvFollowUpId);
        setPipeRdvFollowUpTuTemplateId(linkedPipeRdvFollowUpTuId);
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
        attendre_reponse: relanceDraft.attendreReponse,
      });
      if (!isEphemeralMode) {
        variables = setTemplateEmailPipeRdvTriggerInMeta(variables, {
          enabled: pipeRdvDraft.trigger.enabled,
          stages: pipeRdvDraft.trigger.enabled ? pipeRdvDraft.trigger.stages : [],
        });
        variables = setTemplateEmailPipeRdvReminderInMeta(variables, {
          enabled: pipeRdvDraft.trigger.enabled && pipeRdvDraft.reminder.enabled,
          delai_heures: pipeRdvDraft.reminder.delai_heures,
          envoi_heure: pipeRdvDraft.reminder.envoi_heure,
          use_same_message: pipeRdvDraft.reminder.use_same_message,
          reminder_template_id:
            pipeRdvDraft.trigger.enabled &&
            pipeRdvDraft.reminder.enabled &&
            !pipeRdvDraft.reminder.use_same_message
              ? linkedPipeRdvReminderId
              : null,
          reminder_tutoiement_template_id:
            pipeRdvDraft.trigger.enabled &&
            pipeRdvDraft.reminder.enabled &&
            !pipeRdvDraft.reminder.use_same_message
              ? linkedPipeRdvReminderTuId
              : null,
        });
        variables = setTemplateEmailPipeRdvFollowUpInMeta(variables, {
          enabled: pipeRdvDraft.trigger.enabled && pipeRdvDraft.followUp.enabled,
          delai_heures: pipeRdvDraft.followUp.delai_heures,
          envoi_heure: pipeRdvDraft.followUp.envoi_heure,
          use_same_message: pipeRdvDraft.followUp.use_same_message,
          follow_up_template_id:
            pipeRdvDraft.trigger.enabled &&
            pipeRdvDraft.followUp.enabled &&
            !pipeRdvDraft.followUp.use_same_message
              ? linkedPipeRdvFollowUpId
              : null,
          follow_up_tutoiement_template_id:
            pipeRdvDraft.trigger.enabled &&
            pipeRdvDraft.followUp.enabled &&
            !pipeRdvDraft.followUp.use_same_message
              ? linkedPipeRdvFollowUpTuId
              : null,
        });
        variables = setTemplateEmailPlacementConformeTriggerInMeta(variables, {
          enabled: placementConformeDraft.trigger.enabled,
          stellium_labels: placementConformeDraft.trigger.enabled
            ? placementConformeDraft.trigger.stellium_labels
            : [],
        });
      }
      variables = stampStelliumPerfTemplateMeta(
        stampScpiBulletinTemplateMeta(variables, formData.nom),
        formData.nom
      );
      if (effectiveTemplateId != null) {
        variables = setTemplateEmailAttachmentsInMeta(
          variables,
          attachments.map((att) => ({ ...att, template_id: effectiveTemplateId }))
        );
      }

      const payload: NewTemplateEmail = {
        ...formData,
        categorie: isEphemeralMode ? "EPHEMERE" : formData.categorie,
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
        await updateTemplateEmail(templateId, {
          ...payload,
          variables: setTemplateEmailAttachmentsInMeta(
            variables,
            attachments.map((att) => ({ ...att, template_id: templateId! }))
          ),
        });
        if (!isEphemeralMode || saveIntentAtStart === "default") {
          toast.success(isEphemeralMode ? "Campagne enregistrée" : "Modèle créé");
        }
      }
      if (templateId != null) {
        setPersistedTemplateId(templateId);
        const removed = findRemovedAttachments(attachments, baselineAttachmentsRef.current);
        for (const att of removed) {
          await removeTemplateEmailAttachment(templateId, att.stored_name);
        }
        baselineAttachmentsRef.current = attachments.map((att) => ({
          ...att,
          template_id: templateId,
        }));
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
      // Variantes détachées (tu désactivé, relance revenue au même message, Pipe coupé) :
      // supprimées si plus rien ne les utilise — pas de modèle « fantôme » dans la bibliothèque.
      const previousChildIds = [
        tutoiementTemplateId,
        relanceTemplateId,
        relanceTuTemplateId,
        pipeRdvReminderTemplateId,
        pipeRdvReminderTuTemplateId,
        pipeRdvFollowUpTemplateId,
        pipeRdvFollowUpTuTemplateId,
      ].filter((id): id is number => id != null);
      if (previousChildIds.length > 0) {
        const deleted = await deleteDetachedTemplateChildren(previousChildIds).catch(
          () => [] as number[]
        );
        // Variante supprimée : son id et ses pièces jointes en mémoire sont oubliés (sinon une
        // réactivation dans la même session réutiliserait des fichiers supprimés).
        const forget = (
          id: number | null,
          setter: (value: number | null) => void,
          attachmentsState: { reset: () => void }
        ) => {
          if (id == null || !deleted.includes(id)) return;
          setter(null);
          attachmentsState.reset();
        };
        forget(tutoiementTemplateId, setTutoiementTemplateId, tutoiementAttachmentsState);
        forget(relanceTemplateId, setRelanceTemplateId, relanceAttachmentsState);
        forget(relanceTuTemplateId, setRelanceTuTemplateId, relanceTuAttachmentsState);
        forget(pipeRdvReminderTemplateId, setPipeRdvReminderTemplateId, pipeReminderAttachmentsState);
        forget(
          pipeRdvReminderTuTemplateId,
          setPipeRdvReminderTuTemplateId,
          pipeReminderTuAttachmentsState
        );
        forget(pipeRdvFollowUpTemplateId, setPipeRdvFollowUpTemplateId, pipeFollowUpAttachmentsState);
        forget(
          pipeRdvFollowUpTuTemplateId,
          setPipeRdvFollowUpTuTemplateId,
          pipeFollowUpTuAttachmentsState
        );
      }
      if (templateId != null) {
        await setTemplateEmailAction({
          template_id: templateId,
          tache_actif: tacheActif,
          tache_titre: tacheTitre.trim() || null,
          tache_priorite: tachePriorite,
          tache_delai_jours: tacheDelaiJours,
        });
        notifyTachesChanged();
      }
      lastSubmitOkRef.current = true;
      if (dirtyVersionRef.current === versionAtStart) setDirty(false);
      // Liens étiquette ↔ modèle à jour (confirmation « Remplacer ? » juste).
      void getAllEtiquettes().then(setEtiquettes).catch(() => undefined);
      const keepOpen = keepOpenAfterSaveRef.current;
      await onSuccess?.({ keepOpen });
      if (isEphemeralMode) {
        if (saveIntentAtStart === "default" && !keepOpen) {
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

  const applyCorpsHtml = useCallback((html: string) => {
    const normalized = sanitizeTemplateEmailHtml(html.trim());
    setCorpsHtml(normalized);
    setFormData((prev) => ({
      ...prev,
      corps: htmlToPlainEmail(normalized),
      variables: setTemplateCorpsHtmlInMeta(prev.variables, normalized || null),
    }));
  }, []);

  const applyTuCorpsHtml = useCallback((html: string) => {
    const normalized = sanitizeTemplateEmailHtml(html.trim());
    setTutoiementDraft((prev) => ({ ...prev, corpsHtml: normalized }));
    setTutoiementVariables((prev) => setTemplateCorpsHtmlInMeta(prev, normalized || null));
  }, []);

  const captureSujetSelectionFor = useCallback(
    (
      inputRef: React.RefObject<HTMLInputElement | null>,
      selectionRef: React.MutableRefObject<{ start: number; end: number }>
    ) => {
      const el = inputRef.current;
      if (!el) return;
      selectionRef.current = {
        start: el.selectionStart ?? el.value.length,
        end: el.selectionEnd ?? el.value.length,
      };
    },
    []
  );

  const captureSujetSelection = useCallback(() => {
    captureSujetSelectionFor(sujetInputRef, sujetSelectionRef);
  }, [captureSujetSelectionFor]);

  useEffect(() => {
    if (!open) return;
    const onSelectionChange = () => {
      if (sujetInputRef.current === document.activeElement) {
        captureSujetSelection();
      } else if (tuSujetInputRef.current === document.activeElement) {
        captureSujetSelectionFor(tuSujetInputRef, tuSujetSelectionRef);
      } else if (relanceSujetInputRef.current === document.activeElement) {
        captureSujetSelectionFor(relanceSujetInputRef, relanceSujetSelectionRef);
      } else if (relanceTuSujetInputRef.current === document.activeElement) {
        captureSujetSelectionFor(relanceTuSujetInputRef, relanceTuSujetSelectionRef);
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [open, captureSujetSelection, captureSujetSelectionFor]);

  const captureSelectionsBeforeVariableInsert = useCallback(
    (target: VariableInsertTarget) => {
      const targetConfig = {
        main: {
          sujetRef: sujetInputRef,
          sujetSel: sujetSelectionRef,
          editorRef: richEditorRef,
          editorSel: editorSelectionRef,
        },
        tutoiement: {
          sujetRef: tuSujetInputRef,
          sujetSel: tuSujetSelectionRef,
          editorRef: tuRichEditorRef,
          editorSel: tuEditorSelectionRef,
        },
        relance: {
          sujetRef: relanceSujetInputRef,
          sujetSel: relanceSujetSelectionRef,
          editorRef: relanceRichEditorRef,
          editorSel: relanceEditorSelectionRef,
        },
        relanceTu: {
          sujetRef: relanceTuSujetInputRef,
          sujetSel: relanceTuSujetSelectionRef,
          editorRef: relanceTuRichEditorRef,
          editorSel: relanceTuEditorSelectionRef,
        },
      }[target];

      if (targetConfig.sujetRef.current === document.activeElement) {
        captureSujetSelectionFor(targetConfig.sujetRef, targetConfig.sujetSel);
      }
      if (targetConfig.editorRef.current?.contains(document.activeElement)) {
        targetConfig.editorSel.current = saveRichEditorSelection(targetConfig.editorRef.current);
      }
    },
    [captureSujetSelectionFor]
  );

  const insertVariable = useCallback(
    (target: VariableInsertTarget, variable: string, field: "sujet" | "corps") => {
      if (field === "corps") {
        const editorRef =
          target === "main"
            ? richEditorRef
            : target === "tutoiement"
              ? tuRichEditorRef
              : target === "relance"
                ? relanceRichEditorRef
                : relanceTuRichEditorRef;
        const selectionRef =
          target === "main"
            ? editorSelectionRef
            : target === "tutoiement"
              ? tuEditorSelectionRef
              : target === "relance"
                ? relanceEditorSelectionRef
                : relanceTuEditorSelectionRef;
        const html = insertTextInRichEditor(
          editorRef.current,
          variable,
          selectionRef.current
        );
        if (target === "main") {
          applyCorpsHtml(html);
        } else if (target === "tutoiement") {
          applyTuCorpsHtml(html);
        } else if (target === "relance") {
          setRelanceDraft((prev) => ({
            ...prev,
            corpsHtml: canonicalizeTemplateCorpsHtml(html.trim()),
          }));
        } else {
          setRelanceTuDraft((prev) => ({
            ...prev,
            corpsHtml: canonicalizeTemplateCorpsHtml(html.trim()),
          }));
        }
        editorRef.current?.focus();
        return;
      }

      const sujetRef =
        target === "main"
          ? sujetInputRef
          : target === "tutoiement"
            ? tuSujetInputRef
            : target === "relance"
              ? relanceSujetInputRef
              : relanceTuSujetInputRef;
      const sujetSelRef =
        target === "main"
          ? sujetSelectionRef
          : target === "tutoiement"
            ? tuSujetSelectionRef
            : target === "relance"
              ? relanceSujetSelectionRef
              : relanceTuSujetSelectionRef;

      const currentSujet =
        target === "main"
          ? formData.sujet
          : target === "tutoiement"
            ? tutoiementDraft.sujet
            : target === "relance"
              ? relanceDraft.sujet
              : relanceTuDraft.sujet;

      const selection =
        sujetRef.current === document.activeElement && sujetRef.current
          ? {
              start: sujetRef.current.selectionStart ?? currentSujet.length,
              end: sujetRef.current.selectionEnd ?? currentSujet.length,
            }
          : { ...sujetSelRef.current };

      const { value, caret } = insertTextInPlainField(currentSujet, variable, selection);
      sujetSelRef.current = { start: caret, end: caret };

      if (target === "main") {
        flushSync(() => {
          setFormData((prev) => ({ ...prev, sujet: value }));
        });
      } else if (target === "tutoiement") {
        flushSync(() => {
          setTutoiementDraft((prev) => ({ ...prev, sujet: value }));
        });
      } else if (target === "relance") {
        flushSync(() => {
          setRelanceDraft((prev) => ({ ...prev, sujet: value }));
        });
      } else {
        flushSync(() => {
          setRelanceTuDraft((prev) => ({ ...prev, sujet: value }));
        });
      }

      const input = sujetRef.current;
      if (input) {
        input.focus();
        input.setSelectionRange(caret, caret);
      }
    },
    [
      applyCorpsHtml,
      applyTuCorpsHtml,
      formData.sujet,
      tutoiementDraft.sujet,
      relanceDraft.sujet,
      relanceTuDraft.sujet,
    ]
  );

  const variablePickerCommon = useMemo(
    () => ({
      categorie: formData.categorie as EmailTemplateCategory,
      templateNom: formData.nom,
      agendaLinks,
      placementConformeTriggerEnabled: placementConformeDraft.trigger.enabled,
    }),
    [
      formData.categorie,
      formData.nom,
      agendaLinks,
      placementConformeDraft.trigger.enabled,
    ]
  );

  const buildVariablePicker = useCallback(
    (
      target: VariableInsertTarget,
      ctx: { sujet: string; corps: string; corpsHtml: string }
    ) => (
      <TemplateEmailVariableField
        {...variablePickerCommon}
        sujet={ctx.sujet}
        corps={ctx.corps}
        corpsHtml={ctx.corpsHtml}
        onInsert={(token, field) => insertVariable(target, token, field)}
        onMouseDownCapture={() => captureSelectionsBeforeVariableInsert(target)}
      />
    ),
    [variablePickerCommon, insertVariable, captureSelectionsBeforeVariableInsert]
  );

  const mainVariablePicker = useMemo(
    () =>
      buildVariablePicker("main", {
        sujet: formData.sujet,
        corps: formData.corps,
        corpsHtml,
      }),
    [buildVariablePicker, formData.sujet, formData.corps, corpsHtml]
  );

  const tutoiementVariablePicker = useMemo(
    () =>
      buildVariablePicker("tutoiement", {
        sujet: tutoiementDraft.sujet,
        corps: htmlToPlainEmail(tutoiementDraft.corpsHtml),
        corpsHtml: tutoiementDraft.corpsHtml,
      }),
    [buildVariablePicker, tutoiementDraft.sujet, tutoiementDraft.corpsHtml]
  );

  const relanceVariablePicker = useMemo(
    () =>
      buildVariablePicker("relance", {
        sujet: relanceDraft.sujet,
        corps: htmlToPlainEmail(relanceDraft.corpsHtml),
        corpsHtml: relanceDraft.corpsHtml,
      }),
    [buildVariablePicker, relanceDraft.sujet, relanceDraft.corpsHtml]
  );

  const relanceTuVariablePicker = useMemo(
    () =>
      buildVariablePicker("relanceTu", {
        sujet: relanceTuDraft.sujet,
        corps: htmlToPlainEmail(relanceTuDraft.corpsHtml),
        corpsHtml: relanceTuDraft.corpsHtml,
      }),
    [buildVariablePicker, relanceTuDraft.sujet, relanceTuDraft.corpsHtml]
  );

  const toggleEtiquetteLink = (id: number) => {
    const adding = !linkedEtiquetteIds.includes(id);
    const etiquette = etiquettes.find((e) => e.id === id);
    const currentTemplateId = etiquette?.email_template_id ?? null;
    // Une étiquette n'envoie qu'un modèle : relier celui-ci remplacerait son modèle actuel.
    if (adding && etiquette && currentTemplateId != null && currentTemplateId !== effectiveTemplateId) {
      setEtiquetteReplaceConfirm({
        etiquetteId: id,
        etiquetteNom: etiquette.nom,
        currentTemplateNom:
          templateNames.get(currentTemplateId) ?? "un autre modèle",
      });
      return;
    }
    setLinkedEtiquetteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    markDirty();
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


  /** Enregistre sans fermer l'éditeur (pièce jointe sur un modèle pas encore enregistré). */
  const saveKeepingOpen = async (): Promise<boolean> => {
    keepOpenAfterSaveRef.current = true;
    try {
      await handleSubmit({ preventDefault() {} } as FormEvent);
    } finally {
      keepOpenAfterSaveRef.current = false;
    }
    return lastSubmitOkRef.current;
  };

  /** Toute saisie ou action dans le formulaire compte comme une modification, sauf l'aperçu,
   * la recherche de variables, les onglets et le pied de fenêtre (`data-no-dirty`). */
  const trackDirtyEvent = (
    target: EventTarget | null,
    kind: "input" | "click",
    trusted: boolean
  ) => {
    // Seules les actions de l'utilisateur comptent : les composants (listes, interrupteurs)
    // émettent aussi des événements quand le code fixe leur valeur au chargement.
    if (!trusted || !(target instanceof Element)) return;
    if (target.closest("[data-no-dirty]") || target.closest('[role="tab"]')) return;
    if (kind === "click") {
      const control = target.closest(
        'button, [role="switch"], [role="checkbox"], [role="radio"], [role="option"], [role="menuitem"]'
      );
      // Ouvrir une liste déroulante n'est pas une modification (le choix d'une option, si).
      if (!control || control.getAttribute("role") === "combobox") return;
    }
    markDirty();
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      // Enregistre sans fermer ni changer d'onglet ; ignoré pendant un enregistrement.
      if (!e.repeat && !loading) void saveKeepingOpen();
      return;
    }
    // Activation au clavier (Entrée / Espace sur une option, un interrupteur, une pastille).
    if (e.key === " " || e.key === "Enter") {
      trackDirtyEvent(e.target, "click", e.nativeEvent.isTrusted);
    }
    // Entrée dans un champ d'une ligne ne doit jamais enregistrer (ni fermer) le modèle.
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      const type = e.target.type;
      if (!["checkbox", "radio", "button", "submit", "file"].includes(type)) e.preventDefault();
    }
  };

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true);
        else handleRequestClose();
      }}
    >
      <DialogContent className="max-w-[min(96vw,88rem)] max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
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
        <div className="px-6">
          <TeamLockBanner
            heldBy={teamLock.heldBy}
            loading={teamLock.loading}
            message={teamLock.error}
          />
        </div>

        <TemplateEmailAttachmentSaveContext.Provider
          value={{ saveBeforeAttach: saveKeepingOpen, markDirty }}
        >
        <form
          ref={formRef}
          noValidate
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          onInputCapture={(e) => trackDirtyEvent(e.target, "input", e.nativeEvent.isTrusted)}
          onChangeCapture={(e) => trackDirtyEvent(e.target, "input", e.nativeEvent.isTrusted)}
          onClickCapture={(e) => trackDirtyEvent(e.target, "click", e.nativeEvent.isTrusted)}
          // Choix d'une option à la souris dans une liste : validé au relâchement, sans clic.
          onPointerUpCapture={(e) => {
            if (e.target instanceof Element && e.target.closest('[role="option"]')) {
              trackDirtyEvent(e.target, "click", e.nativeEvent.isTrusted);
            }
          }}
          className="flex flex-col flex-1 min-h-0"
        >
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
                    isEphemeralMode ? "grid-cols-6" : "grid-cols-8"
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
                  {!isEphemeralMode && (
                    <TabsTrigger value="pipe-rdv">
                      Pipe RDV
                      {pipeRdvDraft.trigger.enabled && (
                        <span className="ml-1.5 text-[10px] text-emerald-700">on</span>
                      )}
                    </TabsTrigger>
                  )}
                  {!isEphemeralMode && (
                    <TabsTrigger value="placement-conforme">
                      Box Placement
                      {placementConformeDraft.trigger.enabled && (
                        <span className="ml-1.5 text-[10px] text-teal-700">on</span>
                      )}
                    </TabsTrigger>
                  )}
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
                  <TabsTrigger value="action">
                    Action
                    {tacheActif && (
                      <span className="ml-1.5 text-[10px] text-sky-700">on</span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                  <TabsContent value="message" className="mt-0 space-y-4 data-[state=inactive]:hidden">
                    <div className="space-y-2">
                      <Label htmlFor="nom">Nom du modèle *</Label>
                      <Input
                        id="nom"
                        value={formData.nom}
                        onChange={(e) => {
                          setFormData({ ...formData, nom: e.target.value });
                          clearInvalid("nom");
                        }}
                        placeholder="Ex. Rappel déclaration IR"
                        autoFocus
                        aria-invalid={invalidFields.has("nom") || undefined}
                        className={cn(invalidFields.has("nom") && "border-destructive")}
                      />
                      {invalidFields.has("nom") && (
                        <p className="text-xs text-destructive">Donnez un nom au modèle.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Intention</Label>
                      {isEphemeralMode ? (
                        <>
                          <Badge className={getTemplateCategoryMeta("EPHEMERE").badgeClass}>
                            Éphémère
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            Attribué automatiquement aux campagnes éphémères.
                          </p>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sujet">Objet *</Label>
                      <Input
                        ref={sujetInputRef}
                        id="sujet"
                        value={formData.sujet}
                        onChange={(e) => {
                          setFormData({ ...formData, sujet: e.target.value });
                          clearInvalid("sujet");
                        }}
                        aria-invalid={invalidFields.has("sujet") || undefined}
                        className={cn(invalidFields.has("sujet") && "border-destructive")}
                        onSelect={captureSujetSelection}
                        onKeyUp={captureSujetSelection}
                        onClick={captureSujetSelection}
                        onFocus={captureSujetSelection}
                        onBlur={captureSujetSelection}
                        placeholder="Ex. {{prenom}}, votre déclaration d'impôts"
                      />
                      {invalidFields.has("sujet") && (
                        <p className="text-xs text-destructive">L&apos;objet est obligatoire.</p>
                      )}
                    </div>

                    {mainVariablePicker}

                    <TemplateEmailAttachmentsPanel
                      templateId={effectiveTemplateId}
                      attachments={attachments}
                      onChange={setAttachments}
                      disabled={loading}
                    />

                    <div
                      className={cn(
                        "space-y-2",
                        invalidFields.has("corps") && "rounded-md ring-1 ring-destructive p-1"
                      )}
                    >
                      <Label htmlFor="corps">Message *</Label>
                      <RichTextEmailEditor
                        ref={richEditorRef}
                        value={corpsHtml}
                        onChange={(html) => {
                          applyCorpsHtml(html);
                          clearInvalid("corps");
                        }}
                        onSelectionSave={(range) => {
                          editorSelectionRef.current = range;
                        }}
                        minHeight="240px"
                      />
                    </div>
                    {unresolvedAgendaTokens.length > 0 && (
                      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        Lien d&apos;agenda introuvable : {unresolvedAgendaTokens.join(", ")}. Il
                        partirait vide — l&apos;envoi sera bloqué tant que le lien n&apos;existe pas
                        (Paramètres → Profil, ou lien d&apos;agenda choisi pour ce modèle).
                      </p>
                    )}

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

                    <div className="space-y-2 lg:hidden" data-no-dirty>
                      <Label>Aperçu sur</Label>
                      <Select value={previewContactId} onValueChange={setPreviewContactId}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent data-no-dirty>
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
                        templateVariables={previewVariables}
                        cgp={cgp}
                        agendaLinkId={formData.agenda_link_id}
                        contact={previewContact}
                        tutoiement={previewTutoiement}
                        previewRegistre={previewContact ? undefined : previewRegistre}
                        placementConformeTriggerEnabled={placementConformeDraft.trigger.enabled}
                        allowSendTest
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="tutoiement" className="mt-0 data-[state=inactive]:hidden">
                    <TemplateEmailTutoiementPanel
                      draft={tutoiementDraft}
                      onChange={setTutoiementDraft}
                      onCorpsHtmlChange={applyTuCorpsHtml}
                      editorElementRef={tuRichEditorRef}
                      parentNom={formData.nom}
                      templateId={tutoiementTemplateId}
                      attachments={tutoiementAttachmentsState.attachments}
                      onAttachmentsChange={tutoiementAttachmentsState.setAttachments}
                      attachmentsDisabled={loading}
                      variablePicker={tutoiementVariablePicker}
                      sujetInputRef={tuSujetInputRef}
                      onSujetSelectionCapture={() =>
                        captureSujetSelectionFor(tuSujetInputRef, tuSujetSelectionRef)
                      }
                      onEditorSelectionSave={(range) => {
                        tuEditorSelectionRef.current = range;
                      }}
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
                      relanceTemplateId={relanceTemplateId}
                      relanceAttachments={relanceAttachmentsState.attachments}
                      onRelanceAttachmentsChange={relanceAttachmentsState.setAttachments}
                      relanceTuTemplateId={relanceTuTemplateId}
                      relanceTuAttachments={relanceTuAttachmentsState.attachments}
                      onRelanceTuAttachmentsChange={relanceTuAttachmentsState.setAttachments}
                      attachmentsDisabled={loading}
                      variablePicker={relanceVariablePicker}
                      relanceTuVariablePicker={relanceTuVariablePicker}
                      relanceSujetInputRef={relanceSujetInputRef}
                      onRelanceSujetSelectionCapture={() =>
                        captureSujetSelectionFor(relanceSujetInputRef, relanceSujetSelectionRef)
                      }
                      relanceEditorRef={relanceRichEditorRef}
                      onRelanceEditorSelectionSave={(range) => {
                        relanceEditorSelectionRef.current = range;
                      }}
                      relanceTuSujetInputRef={relanceTuSujetInputRef}
                      onRelanceTuSujetSelectionCapture={() =>
                        captureSujetSelectionFor(relanceTuSujetInputRef, relanceTuSujetSelectionRef)
                      }
                      relanceTuEditorRef={relanceTuRichEditorRef}
                      onRelanceTuEditorSelectionSave={(range) => {
                        relanceTuEditorSelectionRef.current = range;
                      }}
                    />
                  </TabsContent>

                  {!isEphemeralMode && (
                    <TabsContent value="pipe-rdv" className="mt-0 data-[state=inactive]:hidden">
                      <TemplateEmailPipeRdvPanel
                        draft={pipeRdvDraft}
                        onChange={handlePipeRdvDraftChange}
                        parentNom={formData.nom}
                        mainTutoiementEnabled={tutoiementDraft.enabled}
                        reminderTemplateId={pipeRdvReminderTemplateId}
                        reminderAttachments={pipeReminderAttachmentsState.attachments}
                        onReminderAttachmentsChange={pipeReminderAttachmentsState.setAttachments}
                        reminderTuTemplateId={pipeRdvReminderTuTemplateId}
                        reminderTuAttachments={pipeReminderTuAttachmentsState.attachments}
                        onReminderTuAttachmentsChange={pipeReminderTuAttachmentsState.setAttachments}
                        followUpTemplateId={pipeRdvFollowUpTemplateId}
                        followUpAttachments={pipeFollowUpAttachmentsState.attachments}
                        onFollowUpAttachmentsChange={pipeFollowUpAttachmentsState.setAttachments}
                        followUpTuTemplateId={pipeRdvFollowUpTuTemplateId}
                        followUpTuAttachments={pipeFollowUpTuAttachmentsState.attachments}
                        onFollowUpTuAttachmentsChange={pipeFollowUpTuAttachmentsState.setAttachments}
                        attachmentsDisabled={loading}
                      />
                    </TabsContent>
                  )}

                  {!isEphemeralMode && (
                    <TabsContent
                      value="placement-conforme"
                      className="mt-0 data-[state=inactive]:hidden"
                    >
                      <TemplateEmailPlacementConformePanel
                        draft={placementConformeDraft}
                        onChange={setPlacementConformeDraft}
                      />
                    </TabsContent>
                  )}

                  <TabsContent value="declencheur" className="mt-0 data-[state=inactive]:hidden">
                    {souscriptionDuplicateWarning && (
                      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                        {souscriptionDuplicateWarning}
                      </p>
                    )}
                    <TemplateEmailTriggerPanel
                      trigger={emailTrigger}
                      onChange={setEmailTrigger}
                      templateId={effectiveTemplateId}
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
                        <div data-no-dirty>
                        <CategoryTogglePills
                          categories={etiquettes.map((e) => ({
                            value: String(e.id),
                            label: e.nom,
                          }))}
                          selected={linkedEtiquetteIds.map(String)}
                          onToggle={(value) => toggleEtiquetteLink(parseInt(value, 10))}
                        />
                        </div>
                      )}
                      {(() => {
                        const others = etiquettes.filter(
                          (e) =>
                            !linkedEtiquetteIds.includes(e.id) &&
                            e.email_template_id != null &&
                            e.email_template_id !== effectiveTemplateId
                        );
                        if (others.length === 0) return null;
                        return (
                          <p className="text-xs text-muted-foreground">
                            Déjà reliées à un autre modèle :{" "}
                            {others
                              .map(
                                (e) =>
                                  `${e.nom} → « ${templateNames.get(e.email_template_id!) ?? "autre modèle"} »`
                              )
                              .join(" · ")}
                          </p>
                        );
                      })()}
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

                  <TabsContent value="action" className="mt-0 data-[state=inactive]:hidden">
                    <TemplateEmailTacheActionPanel
                      tacheActif={tacheActif}
                      onTacheActifChange={setTacheActif}
                      tacheTitre={tacheTitre}
                      onTacheTitreChange={setTacheTitre}
                      tachePriorite={tachePriorite}
                      onTachePrioriteChange={setTachePriorite}
                      tacheDelaiJours={tacheDelaiJours}
                      onTacheDelaiJoursChange={setTacheDelaiJours}
                    />
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
                          onCampaignClosed={async () => {
                            setDirty(false);
                            await onSuccess?.();
                            onOpenChange(false);
                          }}
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
              data-no-dirty
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
                <SelectContent data-no-dirty>
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
                  <SelectContent data-no-dirty>
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
                templateVariables={previewVariables}
                cgp={cgp}
                agendaLinkId={formData.agenda_link_id}
                contact={previewContact}
                tutoiement={previewTutoiement}
                previewRegistre={previewContact ? undefined : previewRegistre}
                placementConformeTriggerEnabled={placementConformeDraft.trigger.enabled}
                label=""
                allowSendTest
              />
            </aside>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2" data-no-dirty>
            {dirty && (
              <span className="mr-auto self-center text-xs text-muted-foreground">
                Modifications non enregistrées · Ctrl+S pour enregistrer
              </span>
            )}
            <Button type="button" variant="outline" onClick={handleRequestClose}>
              {shouldConfirmAbandonEphemeral() ? "Abandonner" : "Annuler"}
            </Button>
            <Button type="submit" disabled={loading || !teamLock.ready}>
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
        </TemplateEmailAttachmentSaveContext.Provider>
      </DialogContent>
    </Dialog>

    <AlertDialog
      open={etiquetteReplaceConfirm != null}
      onOpenChange={(next) => {
        if (!next) setEtiquetteReplaceConfirm(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remplacer le modèle de cette étiquette ?</AlertDialogTitle>
          <AlertDialogDescription>
            L&apos;étiquette « {etiquetteReplaceConfirm?.etiquetteNom} » envoie actuellement «{" "}
            {etiquetteReplaceConfirm?.currentTemplateNom} ». Une étiquette n&apos;envoie qu&apos;un
            modèle : la relier à celui-ci arrêtera l&apos;envoi de «{" "}
            {etiquetteReplaceConfirm?.currentTemplateNom} » pour cette étiquette (à
            l&apos;enregistrement).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Garder l&apos;actuel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const id = etiquetteReplaceConfirm?.etiquetteId;
              setEtiquetteReplaceConfirm(null);
              if (id != null) {
                setLinkedEtiquetteIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                markDirty();
              }
            }}
          >
            Remplacer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={unsavedConfirmOpen} onOpenChange={setUnsavedConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle>
          <AlertDialogDescription>
            Vos modifications de ce modèle seront perdues.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuer l&apos;édition</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              setUnsavedConfirmOpen(false);
              setDirty(false);
              closeForm();
            }}
          >
            Quitter sans enregistrer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

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
