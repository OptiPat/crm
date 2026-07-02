import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  createEtiquette, 
  updateEtiquette,
  getEtiquetteById,
  getAllEtiquettes,
  getContrastColor,
  stringifyConditionConfig,
  stringifyCategories,
  parseConditionConfig,
  parseCategories,
  getEtiquetteAction,
  setEtiquetteAction,
  COULEURS_ETIQUETTES,
  MOIS_LABELS,
  type NewEtiquette, 
  type EtiquetteWithCount,
  type TacheActionPriorite,
  type ConditionDelaiSansContact,
  type ConditionDateApproche,
  type ConditionDateApprocheInvestissement,
  type ConditionPeriodeAnnee,
  type ConditionTypeProduit,
  type ConditionAgeApproche,
  type ConditionEvenementSouscription,
} from "@/lib/api/tauri-etiquettes";
import { INVESTISSEMENT_TYPE_GROUPS } from "@/lib/etiquettes/etiquette-investissement-types";
import { TypeProduitConditionFields } from "@/components/etiquettes/TypeProduitConditionFields";
import { buildTypeProduitConditionConfig } from "@/lib/etiquettes/type-produit-condition";
import {
  localDatetimeToUnix,
  unixToLocalDatetime,
} from "@/lib/etiquettes/etiquette-email-preview";
import { getAllTemplatesEmail, type TemplateEmail } from "@/lib/api/tauri-templates-email";
import {
  parseEmailEnvoiJoursSemaine,
  serializeEmailEnvoiJoursSemaine,
  type EmailEnvoiJourCode,
} from "@/lib/emails/email-envoi-schedule";
import { suggestTemplateIdForEtiquette } from "@/lib/emails/template-email-meta";
import { resolveCampaignTemplateId } from "@/lib/emails/template-library";
import { EtiquetteEmailCampaignFields } from "@/components/etiquettes/EtiquetteEmailCampaignFields";
import { EtiquetteTacheActionFields } from "@/components/etiquettes/EtiquetteTacheActionFields";
import { setEtiquettePipelineActif } from "@/lib/api/tauri-pipeline";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { isExceltisEtiquetteNom } from "@/lib/etiquettes/exceltis";
import {
  CONDITION_TYPE_LABELS,
  type ConditionType,
} from "@/lib/etiquettes/etiquette-condition-labels";
import { formatEtiquetteRuleSummary } from "@/lib/etiquettes/etiquette-form-summary";
import {
  validateEtiquetteFormDetailed,
  validateEtiquetteTacheAction,
  type EtiquetteFormFieldId,
} from "@/lib/etiquettes/etiquette-form-validation";
import { buildEtiquetteRulePreviewJson } from "@/lib/etiquettes/etiquette-rule-preview";
import {
  formatSouscriptionDuplicateWarning,
  templateHasSouscriptionTrigger,
} from "@/lib/emails/template-etiquette-duplicate";
import { EtiquetteSouscriptionGuide } from "@/components/etiquettes/EtiquetteSouscriptionGuide";
import { SouscriptionRepeatModeRadios } from "@/components/etiquettes/SouscriptionRepeatModeRadios";
import {
  EtiquetteCreationPicker,
  type EtiquetteCreationIntent,
} from "@/components/etiquettes/EtiquetteCreationPicker";
import { SegmentForm } from "@/components/etiquettes/SegmentForm";
import { SegmentRulePreview } from "@/components/etiquettes/SegmentRulePreview";
import { IrNetConditionFields, TmiTranchePicker } from "@/components/etiquettes/FiscalRuleFields";
import {
  parseConditionIrNetConfig,
  parseConditionTmiConfig,
  type IrNetOperator,
} from "@/lib/etiquettes/fiscal-tmi";
import { getAllSegments, type Segment } from "@/lib/api/tauri-segments";
import { getCustomFieldDefs, type CustomFieldDef } from "@/lib/api/tauri-custom-fields";
import { ConditionBuilder } from "@/components/etiquettes/ConditionBuilder";
import {
  leafFromLegacy,
  parseRuleTree,
  toRuleTreeSave,
  type RuleLeaf,
  type RuleOp,
} from "@/lib/etiquettes/rule-ast";
import {
  CategoryTogglePills,
  EtiquetteFormPanel,
  EtiquetteFormStatusBadges,
  EtiquetteRuleSummaryCard,
} from "@/components/etiquettes/etiquette-form-ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Tag, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface EtiquetteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  etiquette?: EtiquetteWithCount | null;
  /** Préremplit le formulaire pour une création (copie d’une étiquette existante). */
  duplicateFrom?: EtiquetteWithCount | null;
  createIntent?: EtiquetteCreationIntent | null;
  onSuccess: () => void;
  onSegmentsChanged?: () => void;
  /** Ferme le dialog et ouvre l’onglet Segments de la page Étiquettes. */
  onOpenSegmentsTab?: () => void;
}

const CATEGORIES_CONTACTS = [
  { value: "CLIENT", label: "Client" },
  { value: "PROSPECT_CLIENT", label: "Prospect client" },
  { value: "PROSPECT_FILLEUL", label: "Prospect filleul" },
  { value: "SUSPECT_CLIENT", label: "Suspect client" },
  { value: "SUSPECT_FILLEUL", label: "Suspect filleul" },
] as const;

const CONDITION_TYPES_ORDER: ConditionType[] = [
  "DELAI_SANS_CONTACT",
  "DATE_APPROCHE",
  "PERIODE_ANNEE",
  "TYPE_PRODUIT",
  "DATE_APPROCHE_INVESTISSEMENT",
  "AGE_APPROCHE",
  "TMI",
  "IR_NET",
];

type FormTab = "general" | "rule" | "email" | "action";

export function EtiquetteForm({
  open,
  onOpenChange,
  etiquette,
  duplicateFrom,
  createIntent,
  onSuccess,
  onSegmentsChanged,
  onOpenSegmentsTab,
}: EtiquetteFormProps) {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateEmail[]>([]);
  const [formTab, setFormTab] = useState<FormTab>("general");
  const [creationType, setCreationType] = useState<EtiquetteCreationIntent | null>(null);
  const [creationPickerExpanded, setCreationPickerExpanded] = useState(false);
  const [fieldHighlight, setFieldHighlight] = useState<EtiquetteFormFieldId | null>(null);
  const [highlightRuleLeafIndex, setHighlightRuleLeafIndex] = useState<number | null>(null);
  const [segmentFormOpen, setSegmentFormOpen] = useState(false);
  
  // État du formulaire
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState("#3B82F6");
  const [description, setDescription] = useState("");
  const [priorite, setPriorite] = useState(0);
  const [actif, setActif] = useState(true);
  
  // Attribution automatique
  const [isAuto, setIsAuto] = useState(false);
  const [conditionType, setConditionType] = useState<string>("DELAI_SANS_CONTACT");
  const [delaiJours, setDelaiJours] = useState(365);
  const [inclureSansDate, setInclureSansDate] = useState(true);
  const [ageCible, setAgeCible] = useState(69);
  const [ageJoursAvant, setAgeJoursAvant] = useState(30);
  const [champDate, setChampDate] = useState("date_prochain_suivi");
  const [joursAvant, setJoursAvant] = useState(30);
  const [moisDebut, setMoisDebut] = useState(4);
  const [moisFin, setMoisFin] = useState(5);
  const [typesProduitSelectionnes, setTypesProduitSelectionnes] = useState<string[]>([]);
  const [nomsProduitSelectionnes, setNomsProduitSelectionnes] = useState<string[]>([]);
  const [invChampDate, setInvChampDate] = useState("date_fin_demembrement");
  const [invJoursAvant, setInvJoursAvant] = useState(180);
  const [invTypesProduit, setInvTypesProduit] = useState<string[]>([]);
  const [tmiTranchesSelectionnees, setTmiTranchesSelectionnees] = useState<number[]>([]);
  const [irNetOperator, setIrNetOperator] = useState<IrNetOperator>("gte");
  const [irNetMontant, setIrNetMontant] = useState<number | "">("");
  const [categoriesSelectionnees, setCategoriesSelectionnees] = useState<string[]>(["CLIENT"]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [allEtiquettes, setAllEtiquettes] = useState<{ id: number; nom: string }[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [segmentId, setSegmentId] = useState<number | null>(null);
  const [useGroupRule, setUseGroupRule] = useState(false);
  const [useComboRule, setUseComboRule] = useState(false);
  const [ruleOp, setRuleOp] = useState<RuleOp>("and");
  const [ruleChildren, setRuleChildren] = useState<RuleLeaf[]>([]);
  
  // Email
  const [emailActif, setEmailActif] = useState(false);
  const [emailTemplateId, setEmailTemplateId] = useState<number | null>(null);
  const [emailEnvoiMode, setEmailEnvoiMode] = useState<"eligibility" | "fixed">("eligibility");
  const [emailEnvoiHeure, setEmailEnvoiHeure] = useState("09:00");
  const [emailEnvoiLocal, setEmailEnvoiLocal] = useState("");
  const [emailDelaiJours, setEmailDelaiJours] = useState(0);
  const [emailEnvoiJours, setEmailEnvoiJours] = useState<EmailEnvoiJourCode[] | null>(
    null
  );
  const [rendementCible, setRendementCible] = useState("");
  const [eventTypesProduit, setEventTypesProduit] = useState<string[]>([]);
  const [eventAChaqueSouscription, setEventAChaqueSouscription] = useState(true);

  // Action : créer une tâche à l'attribution automatique
  const [tacheActif, setTacheActif] = useState(false);
  const [tacheTitre, setTacheTitre] = useState("");
  const [tachePriorite, setTachePriorite] = useState<TacheActionPriorite>("NORMALE");
  const [tacheDelaiJours, setTacheDelaiJours] = useState(0);
  const [pipelineActif, setPipelineActif] = useState(false);

  const ruleSummary = useMemo(
    () =>
      formatEtiquetteRuleSummary({
        isAuto,
        conditionType,
        delaiJours,
        inclureSansDate,
        ageCible,
        ageJoursAvant,
        champDate,
        joursAvant,
        moisDebut,
        moisFin,
        typesProduitCount: typesProduitSelectionnes.length,
        nomsProduitCount: nomsProduitSelectionnes.length,
        eventTypesProduitCount:
          conditionType === "EVENEMENT_SOUSCRIPTION"
            ? eventTypesProduit.length
            : undefined,
        aChaqueSouscription:
          conditionType === "EVENEMENT_SOUSCRIPTION" ? eventAChaqueSouscription : undefined,
        invChampDate,
        invJoursAvant,
        invTypesProduitCount: invTypesProduit.length,
        tmiTranches: tmiTranchesSelectionnees,
        irNetOperator,
        irNetMontant: irNetMontant === "" ? null : Number(irNetMontant),
        categories: categoriesSelectionnees,
      }),
    [
      isAuto,
      conditionType,
      delaiJours,
      inclureSansDate,
      ageCible,
      ageJoursAvant,
      champDate,
      joursAvant,
      moisDebut,
      moisFin,
      typesProduitSelectionnes.length,
      nomsProduitSelectionnes.length,
      eventTypesProduit.length,
      eventAChaqueSouscription,
      invChampDate,
      invJoursAvant,
      invTypesProduit.length,
      tmiTranchesSelectionnees,
      irNetOperator,
      irNetMontant,
      categoriesSelectionnees,
    ]
  );

  const templateSouscriptionDuplicateWarning = useMemo(() => {
    if (conditionType !== "EVENEMENT_SOUSCRIPTION" || emailTemplateId == null) {
      return "";
    }
    const tpl = templates.find((t) => t.id === emailTemplateId);
    if (!templateHasSouscriptionTrigger(tpl)) return "";
    return formatSouscriptionDuplicateWarning(tpl?.nom ?? "ce modèle", [nom.trim() || "cette étiquette"]);
  }, [conditionType, emailTemplateId, templates, nom]);

  const reloadSegments = useCallback(() => {
    return getAllSegments()
      .then(setSegments)
      .catch(console.error);
  }, []);

  const applyCreationIntent = useCallback((intent: EtiquetteCreationIntent) => {
    setCreationType(intent);
    if (intent === "manual") {
      setIsAuto(false);
      setEmailActif(false);
      setFormTab("general");
    } else if (intent === "auto") {
      setIsAuto(true);
      setFormTab("rule");
    } else {
      setIsAuto(true);
      setEmailActif(true);
      setFormTab("email");
    }
  }, []);

  // Charger les templates email
  useEffect(() => {
    if (open) {
      getAllTemplatesEmail()
        .then(setTemplates)
        .catch(console.error);
      void reloadSegments();
      getAllEtiquettes()
        .then((list) => setAllEtiquettes(list.map((e) => ({ id: e.id, nom: e.nom }))))
        .catch(console.error);
      getCustomFieldDefs()
        .then(setCustomFields)
        .catch(console.error);
    }
  }, [open, reloadSegments]);

  useEffect(() => {
    if (!open || emailTemplateId == null || templates.length === 0) return;
    const resolved = resolveCampaignTemplateId(emailTemplateId, templates);
    if (resolved !== emailTemplateId) {
      setEmailTemplateId(resolved);
    }
  }, [open, emailTemplateId, templates]);

  // Initialiser le formulaire quand on ouvre/change d'étiquette
  useEffect(() => {
    if (open) {
      setFieldHighlight(null);
      setCreationPickerExpanded(false);
      const source = etiquette ?? duplicateFrom;
      if (source) {
        setCreationType(null);
        setFormTab(
          source.auto_condition_type || source.segment_id ? "rule" : "general"
        );
        setNom(duplicateFrom && !etiquette ? `Copie de ${source.nom}` : source.nom);
        setCouleur(source.couleur);
        setDescription(source.description || "");
        setPriorite(source.priorite);
        setActif(source.actif !== false);
        setPipelineActif(source.pipeline_actif === true);

        // Attribution automatique
        setSegmentId(source.segment_id ?? null);
        setUseGroupRule(!!source.segment_id);
        const tree = parseRuleTree(source.auto_condition_config);
        if (source.segment_id) {
          setIsAuto(true);
          setUseComboRule(false);
        } else if (tree && tree.children.length > 0) {
          setIsAuto(true);
          setUseComboRule(true);
          setRuleOp(tree.op);
          setRuleChildren(tree.children);
        } else {
        setIsAuto(!!source.auto_condition_type);
        setUseComboRule(false);
        if (source.auto_condition_type && source.auto_condition_type !== "RULE_TREE") {
          setConditionType(source.auto_condition_type);
          
          // Parser la config selon le type
          if (source.auto_condition_type === "DELAI_SANS_CONTACT") {
            const config = parseConditionConfig<ConditionDelaiSansContact>(source.auto_condition_config);
            if (config) {
              setDelaiJours(config.jours);
              setInclureSansDate(config.inclure_sans_date !== false);
            }
          } else if (source.auto_condition_type === "AGE_APPROCHE") {
            const config = parseConditionConfig<ConditionAgeApproche>(source.auto_condition_config);
            if (config) {
              setAgeCible(config.age);
              setAgeJoursAvant(config.jours_avant);
            }
          } else if (source.auto_condition_type === "DATE_APPROCHE") {
            const config = parseConditionConfig<ConditionDateApproche>(source.auto_condition_config);
            if (config) {
              setChampDate(config.champ);
              setJoursAvant(config.jours_avant);
            }
          } else if (source.auto_condition_type === "PERIODE_ANNEE") {
            const config = parseConditionConfig<ConditionPeriodeAnnee>(source.auto_condition_config);
            if (config) {
              setMoisDebut(config.mois_debut);
              setMoisFin(config.mois_fin);
            }
          } else if (source.auto_condition_type === "TYPE_PRODUIT") {
            const config = parseConditionConfig<ConditionTypeProduit>(source.auto_condition_config);
            if (config) {
              setTypesProduitSelectionnes(config.types ?? []);
              setNomsProduitSelectionnes(config.noms_produit ?? []);
            }
          } else if (source.auto_condition_type === "DATE_APPROCHE_INVESTISSEMENT") {
            const config = parseConditionConfig<ConditionDateApprocheInvestissement>(
              source.auto_condition_config
            );
            if (config) {
              setInvChampDate(config.champ);
              setInvJoursAvant(config.jours_avant);
              setInvTypesProduit(config.types_produit ?? []);
            }
          } else if (source.auto_condition_type === "EVENEMENT_SOUSCRIPTION") {
            const config = parseConditionConfig<ConditionEvenementSouscription>(
              source.auto_condition_config
            );
            if (config) {
              setEventTypesProduit(config.types ?? []);
              setEventAChaqueSouscription(config.a_chaque_souscription ?? true);
            }
          } else if (source.auto_condition_type === "TMI") {
            const config = parseConditionTmiConfig(source.auto_condition_config);
            if (config) setTmiTranchesSelectionnees(config.tranches);
          } else if (source.auto_condition_type === "IR_NET") {
            const config = parseConditionIrNetConfig(source.auto_condition_config);
            if (config) {
              setIrNetOperator(config.operator);
              setIrNetMontant(config.montant);
            }
          }
          
          setCategoriesSelectionnees(parseCategories(source.auto_categories));
        }
        }
        
        // Email
        setEmailActif(source.email_actif);
        setRendementCible(source.rendement_cible?.trim() ?? "");
        setEmailDelaiJours(source.email_delai_jours ?? 0);
        setEmailTemplateId(source.email_template_id);
        if (source.email_envoi_heure) {
          setEmailEnvoiMode("eligibility");
          setEmailEnvoiHeure(source.email_envoi_heure);
          setEmailEnvoiJours(parseEmailEnvoiJoursSemaine(source.email_envoi_jours_semaine));
          setEmailEnvoiLocal("");
        } else if (source.email_envoi_prevu) {
          setEmailEnvoiMode("fixed");
          setEmailEnvoiLocal(unixToLocalDatetime(source.email_envoi_prevu));
        } else {
          setEmailEnvoiMode(source.auto_condition_type ? "eligibility" : "fixed");
          setEmailEnvoiHeure("09:00");
          setEmailEnvoiJours(null);
          setEmailEnvoiLocal("");
        }
      } else {
        // Mode création - réinitialiser
        setNom("");
        setCouleur("#3B82F6");
        setDescription("");
        setPriorite(0);
        setActif(true);
        setIsAuto(false);
        setConditionType("DELAI_SANS_CONTACT");
        setDelaiJours(365);
        setInclureSansDate(true);
        setAgeCible(69);
        setAgeJoursAvant(30);
        setChampDate("date_prochain_suivi");
        setJoursAvant(30);
        setMoisDebut(4);
        setMoisFin(5);
        setTypesProduitSelectionnes([]);
        setNomsProduitSelectionnes([]);
        setInvChampDate("date_fin_demembrement");
        setInvJoursAvant(180);
        setInvTypesProduit([]);
        setTmiTranchesSelectionnees([]);
        setIrNetOperator("gte");
        setIrNetMontant("");
        setCategoriesSelectionnees(["CLIENT"]);
        setSegmentId(null);
        setUseGroupRule(false);
        setUseComboRule(false);
        setRuleChildren([]);
        setEmailActif(false);
        setEmailTemplateId(null);
        setEmailEnvoiMode("eligibility");
        setEmailEnvoiHeure("09:00");
        setEmailEnvoiJours(null);
        setEmailEnvoiLocal("");
        setEmailDelaiJours(0);
        setRendementCible("");
        setEventTypesProduit([]);
        setEventAChaqueSouscription(true);
        setTacheActif(false);
        setTacheTitre("");
        setTachePriorite("NORMALE");
        setTacheDelaiJours(0);
        setPipelineActif(false);
        setCreationType(createIntent ?? null);
        if (createIntent) {
          applyCreationIntent(createIntent);
        }
      }
    }
  }, [open, etiquette, duplicateFrom, createIntent, applyCreationIntent]);

  const selectedSegmentRuleJson =
    segmentId != null ? segments.find((s) => s.id === segmentId)?.rule_json : undefined;

  const effectiveCreationIntent = useMemo((): EtiquetteCreationIntent => {
    if (emailActif) return "campaign";
    if (isAuto) return "auto";
    return "manual";
  }, [emailActif, isAuto]);

  const rulePreviewJson = useMemo(
    () =>
      buildEtiquetteRulePreviewJson({
        isAuto,
        segmentId,
        segmentRuleJson: selectedSegmentRuleJson,
        useComboRule,
        ruleOp,
        ruleChildren,
        conditionType,
        categoriesSelectionnees,
        delaiJours,
        inclureSansDate,
        ageCible,
        ageJoursAvant,
        champDate,
        joursAvant,
        moisDebut,
        moisFin,
        typesProduitSelectionnes,
        nomsProduitSelectionnes,
        invChampDate,
        invJoursAvant,
        invTypesProduit,
        tmiTranchesSelectionnees,
        irNetOperator,
        irNetMontant,
      }),
    [
      isAuto,
      segmentId,
      selectedSegmentRuleJson,
      useComboRule,
      ruleOp,
      ruleChildren,
      conditionType,
      categoriesSelectionnees,
      delaiJours,
      inclureSansDate,
      ageCible,
      ageJoursAvant,
      champDate,
      joursAvant,
      moisDebut,
      moisFin,
      typesProduitSelectionnes,
      nomsProduitSelectionnes,
      invChampDate,
      invJoursAvant,
      invTypesProduit,
      tmiTranchesSelectionnees,
      irNetOperator,
      irNetMontant,
    ]
  );

  const formUnlocked = Boolean(etiquette) || Boolean(duplicateFrom) || creationType != null;
  const showFullFormHeader =
    Boolean(etiquette) || Boolean(duplicateFrom) || formTab === "general";

  useEffect(() => {
    if (!open || (!fieldHighlight && highlightRuleLeafIndex == null)) return;
    const id =
      highlightRuleLeafIndex != null
        ? `rule-leaf-${highlightRuleLeafIndex}`
        : fieldHighlight === "email-template"
          ? "email-template"
          : fieldHighlight === "email-heure"
            ? "email-envoi-heure"
            : fieldHighlight === "email-date"
              ? "email-envoi-prevu"
              : fieldHighlight === "rule-ir-net"
                ? "ir-net-montant"
                : fieldHighlight;
    const t = window.setTimeout(() => {
      const el = document.getElementById(id ?? "");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (el instanceof HTMLElement && "focus" in el) {
        el.focus();
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, fieldHighlight, highlightRuleLeafIndex, formTab]);

  // Charger l'action « tâche » existante (édition ou duplication).
  useEffect(() => {
    const actionSourceId = etiquette?.id ?? duplicateFrom?.id;
    if (!open || !actionSourceId) return;
    let cancelled = false;
    void getEtiquetteAction(actionSourceId)
      .then((action) => {
        if (cancelled) return;
        if (action) {
          setTacheActif(action.tache_actif);
          setTacheTitre(action.tache_titre ?? "");
          setTachePriorite(action.tache_priorite);
          setTacheDelaiJours(action.tache_delai_jours);
        } else {
          setTacheActif(false);
          setTacheTitre("");
          setTachePriorite("NORMALE");
          setTacheDelaiJours(0);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, etiquette?.id, duplicateFrom?.id]);

  // Rafraîchir champs campagne depuis la base (modèle, rendement Exceltis, pipeline).
  useEffect(() => {
    const sourceId = etiquette?.id ?? duplicateFrom?.id;
    if (!open || !sourceId) return;
    let cancelled = false;
    void getEtiquetteById(sourceId)
      .then((fresh) => {
        if (cancelled) return;
        if (etiquette?.id) {
          setEmailTemplateId(fresh.email_template_id);
        }
        setRendementCible(fresh.rendement_cible?.trim() ?? "");
        if (etiquette?.id) {
          setPipelineActif(fresh.pipeline_actif);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, etiquette?.id, duplicateFrom?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateEtiquetteFormDetailed({
      nom,
      emailActif,
      emailTemplateId,
      emailEnvoiMode,
      emailEnvoiHeure,
      emailEnvoiLocal,
      actif,
      isAuto,
      segmentId,
      useGroupRule,
      useComboRule,
      categoriesSelectionnees,
      ruleChildren,
      conditionType,
      typesProduitSelectionnes,
      nomsProduitSelectionnes,
      tmiTranchesSelectionnees,
      irNetMontant: irNetMontant === "" ? null : Number(irNetMontant),
    });
    if (validationError) {
      toast.error(validationError.message);
      setFormTab(validationError.tab);
      setFieldHighlight(validationError.fieldId ?? null);
      setHighlightRuleLeafIndex(validationError.ruleLeafIndex ?? null);
      return;
    }
    setHighlightRuleLeafIndex(null);
    const tacheError = validateEtiquetteTacheAction(tacheTitre, tacheActif);
    if (tacheError) {
      toast.error(tacheError.message);
      setFormTab(tacheError.tab);
      setFieldHighlight(tacheError.fieldId ?? null);
      return;
    }

    setLoading(true);

    try {
      let autoConditionType: string | null = null;
      let autoConditionConfig: string | null = null;
      let autoCategories: string | null = null;
      let linkedSegmentId: number | null = null;

      if (isAuto && segmentId) {
        linkedSegmentId = segmentId;
      } else if (isAuto && useComboRule && ruleChildren.length > 0) {
        const saved = toRuleTreeSave(ruleOp, ruleChildren);
        autoConditionType = saved.auto_condition_type;
        autoConditionConfig = saved.auto_condition_config;
        autoCategories = saved.auto_categories;
      } else if (isAuto) {
        autoConditionType = conditionType;
        if (conditionType === "DELAI_SANS_CONTACT") {
          autoConditionConfig = stringifyConditionConfig({
            jours: delaiJours,
            inclure_sans_date: inclureSansDate,
          });
        } else if (conditionType === "AGE_APPROCHE") {
          autoConditionConfig = stringifyConditionConfig({
            age: ageCible,
            jours_avant: ageJoursAvant,
          });
        } else if (conditionType === "DATE_APPROCHE") {
          autoConditionConfig = stringifyConditionConfig({ champ: champDate, jours_avant: joursAvant });
        } else if (conditionType === "PERIODE_ANNEE") {
          autoConditionConfig = stringifyConditionConfig({ mois_debut: moisDebut, mois_fin: moisFin });
        } else if (conditionType === "TYPE_PRODUIT") {
          autoConditionConfig = stringifyConditionConfig(
            buildTypeProduitConditionConfig(typesProduitSelectionnes, nomsProduitSelectionnes)
          );
        } else if (conditionType === "DATE_APPROCHE_INVESTISSEMENT") {
          autoConditionConfig = stringifyConditionConfig({
            champ: invChampDate,
            jours_avant: invJoursAvant,
            types_produit: invTypesProduit.length > 0 ? invTypesProduit : undefined,
          });
        } else if (conditionType === "EVENEMENT_SOUSCRIPTION") {
          autoConditionConfig = stringifyConditionConfig({
            types: eventTypesProduit.length > 0 ? eventTypesProduit : undefined,
            a_chaque_souscription: eventAChaqueSouscription,
          });
        } else if (conditionType === "TMI") {
          autoConditionConfig = stringifyConditionConfig({
            tranches: tmiTranchesSelectionnees,
          });
        } else if (conditionType === "IR_NET") {
          autoConditionConfig = stringifyConditionConfig({
            operator: irNetOperator,
            montant: Number(irNetMontant),
          });
        }
        autoCategories = stringifyCategories(categoriesSelectionnees);
      }
      
      const data: NewEtiquette = {
        nom: nom.trim(),
        couleur,
        icone: null,
        description: description.trim() || null,
        priorite,
        auto_condition_type: isAuto && !linkedSegmentId ? autoConditionType : linkedSegmentId ? null : autoConditionType,
        auto_condition_config: isAuto && !linkedSegmentId ? autoConditionConfig : null,
        auto_categories: isAuto && !linkedSegmentId ? autoCategories : null,
        segment_id: linkedSegmentId,
        email_template_id:
          emailActif && emailTemplateId != null
            ? resolveCampaignTemplateId(emailTemplateId, templates)
            : null,
        email_delai_jours:
          emailActif && emailEnvoiMode === "eligibility" ? emailDelaiJours : 0,
        email_envoi_prevu:
          emailActif && emailEnvoiMode === "fixed"
            ? localDatetimeToUnix(emailEnvoiLocal)
            : null,
        email_envoi_heure:
          emailActif && emailEnvoiMode === "eligibility" ? emailEnvoiHeure.trim() : null,
        email_envoi_jours_semaine:
          emailActif && emailEnvoiMode === "eligibility"
            ? serializeEmailEnvoiJoursSemaine(emailEnvoiJours)
            : null,
        email_actif: emailActif,
        is_default: duplicateFrom ? false : etiquette?.is_default || false,
        actif,
        rendement_cible: isExceltisEtiquetteNom(nom.trim())
          ? rendementCible.trim() || null
          : null,
      };

      let savedId: number;
      if (etiquette) {
        await updateEtiquette(etiquette.id, data);
        savedId = etiquette.id;
        toast.success("Étiquette modifiée");
      } else {
        const created = await createEtiquette(data);
        savedId = created.id;
        toast.success("Étiquette créée");
      }

      await setEtiquetteAction({
        etiquette_id: savedId,
        tache_actif: tacheActif,
        tache_titre: tacheTitre.trim() || null,
        tache_priorite: tachePriorite,
        tache_delai_jours: tacheDelaiJours,
      });
      await setEtiquettePipelineActif(savedId, pipelineActif);

      notifyEtiquettesChanged();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving etiquette:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  const handleTmiToggle = (rate: number) => {
    if (fieldHighlight === "rule-tmi") setFieldHighlight(null);
    setTmiTranchesSelectionnees((prev) =>
      prev.includes(rate) ? prev.filter((r) => r !== rate) : [...prev, rate].sort((a, b) => a - b)
    );
  };

  const handleCategoryToggle = (category: string) => {
    if (fieldHighlight === "rule-categories") setFieldHighlight(null);
    setCategoriesSelectionnees(prev => 
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const toggleTypeInList = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl sm:max-w-4xl h-[min(92vh,860px)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle>
            {duplicateFrom && !etiquette
              ? "Dupliquer l'étiquette"
              : etiquette
                ? "Modifier l'étiquette"
                : "Nouvelle étiquette"}
          </DialogTitle>
          <DialogDescription>
            {duplicateFrom && !etiquette
              ? "Copie de la règle et de la campagne — modifiez le nom puis enregistrez"
              : etiquette
                ? "Apparence, règle automatique et campagne email — un onglet par thème"
                : "Commencez par choisir le type, puis complétez le formulaire"}
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "px-6 sm:px-8 border-b bg-muted/30 shrink-0",
            showFullFormHeader ? "py-4 space-y-3" : "py-2.5"
          )}
        >
          {formUnlocked && (
            <>
          {showFullFormHeader ? (
          <>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 min-w-0">
            <span
              className="inline-block max-w-full px-4 py-2 rounded-xl text-sm font-medium shadow-md leading-snug break-words self-center sm:self-auto"
              style={{
                backgroundColor: couleur,
                color: getContrastColor(couleur),
              }}
            >
              {nom || "Aperçu"}
            </span>
            <div className="flex items-center justify-between sm:justify-end gap-3 rounded-lg border bg-background px-4 py-2.5 min-w-[200px]">
              <div className="space-y-0.5">
                <Label htmlFor="actif" className="text-sm font-medium">
                  Étiquette active
                </Label>
                <p className="text-[11px] text-muted-foreground max-w-[220px]">
                  Désactivée : plus de règle auto ni email. Tags manuels conservés.
                </p>
              </div>
              <Switch id="actif" checked={actif} onCheckedChange={setActif} />
            </div>
          </div>
          <EtiquetteFormStatusBadges
            actif={actif}
            isAuto={isAuto}
            emailActif={emailActif}
            isSystem={etiquette?.is_default}
          />
          </>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
              <span
                className="inline-block max-w-full px-3 py-1.5 rounded-xl text-sm font-medium shadow-sm leading-snug break-words"
                style={{
                  backgroundColor: couleur,
                  color: getContrastColor(couleur),
                }}
              >
                {nom || "Aperçu"}
              </span>
              <EtiquetteFormStatusBadges
                actif={actif}
                isAuto={isAuto}
                emailActif={emailActif}
                isSystem={etiquette?.is_default}
              />
            </div>
          )}
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {!etiquette && !duplicateFrom && (
            <div
              className={cn(
                "px-6 sm:px-8 shrink-0",
                formUnlocked ? "pt-3 border-b pb-3" : "py-10"
              )}
            >
              <EtiquetteCreationPicker
                value={
                  formUnlocked && !creationPickerExpanded
                    ? effectiveCreationIntent
                    : creationType
                }
                onChange={(intent) => {
                  applyCreationIntent(intent);
                  setCreationType((prev) => prev ?? intent);
                  setCreationPickerExpanded(false);
                }}
                onReset={formUnlocked ? () => setCreationPickerExpanded(true) : undefined}
                showExpanded={!formUnlocked || creationPickerExpanded}
                requiredHint
              />
            </div>
          )}
          {formUnlocked ? (
          <Tabs
            value={formTab}
            onValueChange={(v) => setFormTab(v as FormTab)}
            className="flex flex-col flex-1 min-h-0"
          >
            <TabsList className="mx-6 sm:mx-8 mt-4 grid w-auto grid-cols-2 sm:grid-cols-4 shrink-0 h-auto p-1.5 gap-1">
              <TabsTrigger value="general" className="py-2.5 text-sm">
                Général
              </TabsTrigger>
              <TabsTrigger value="rule" className="py-2.5 text-sm">
                Règle auto
                {isAuto && (
                  <span className="ml-1.5 hidden sm:inline text-[10px] text-primary">●</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="email" className="py-2.5 text-sm">
                Campagne email
                {emailActif && (
                  <span className="ml-1.5 hidden sm:inline text-[10px] text-primary">●</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="action" className="py-2.5 text-sm">
                Action
                {tacheActif && (
                  <span className="ml-1.5 hidden sm:inline text-[10px] text-primary">●</span>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-5 sm:py-6 min-h-0">
              <TabsContent value="general" className="mt-0 space-y-6 data-[state=inactive]:hidden">
                <EtiquetteFormPanel title="Identité" description="Nom, couleur et ordre d'affichage sur les fiches">
                  <div className="space-y-2">
                    <Label htmlFor="nom">Nom de l&apos;étiquette *</Label>
                    <Input
                      id="nom"
                      value={nom}
                      onChange={(e) => {
                        setNom(e.target.value);
                        if (fieldHighlight === "nom") setFieldHighlight(null);
                      }}
                      placeholder="Ex. Déclaration IR, Suivi urgent…"
                      required
                      autoFocus={formTab === "general"}
                      className={cn(
                        fieldHighlight === "nom" &&
                          "ring-2 ring-destructive ring-offset-2 ring-offset-background"
                      )}
                    />
                  </div>

                  {isExceltisEtiquetteNom(nom.trim()) && (
                    <div className="space-y-2">
                      <Label htmlFor="exceltis-rendement-cible">Rendement cible (optionnel)</Label>
                      <Input
                        id="exceltis-rendement-cible"
                        value={rendementCible}
                        onChange={(e) => setRendementCible(e.target.value)}
                        placeholder="ex. 9 %/an"
                        className="max-w-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        Inséré dans le modèle via{" "}
                        <code className="text-[11px] bg-muted px-1 rounded">{"{{rendement_exceltis}}"}</code>{" "}
                        (ex. « avec une performance de 9 %/an »).
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Couleur</Label>
                    <div className="flex flex-wrap gap-2">
                      {COULEURS_ETIQUETTES.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => setCouleur(c.code)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            couleur === c.code
                              ? "border-primary scale-110 shadow-md"
                              : "border-transparent hover:scale-105"
                          }`}
                          style={{ backgroundColor: c.code }}
                          title={c.nom}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optionnel)</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Ex. Période de déclaration d'impôts (avril–mai)"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="priorite">Priorité d&apos;affichage</Label>
                      <span className="text-sm font-semibold tabular-nums text-primary">
                        {priorite}
                      </span>
                    </div>
                    <input
                      id="priorite"
                      type="range"
                      min={0}
                      max={100}
                      value={priorite}
                      onChange={(e) => setPriorite(parseInt(e.target.value, 10))}
                      className="w-full accent-primary"
                    />
                    <p className="text-xs text-muted-foreground">
                      Plus la valeur est élevée, plus le badge apparaît en premier (0–100).
                    </p>
                  </div>
                </EtiquetteFormPanel>

                {etiquette?.is_default && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Étiquette préinstallée : désactivez-la si inutilisée. Les attributions auto seront retirées ; la suppression reste impossible.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="rule" className="mt-0 space-y-6 data-[state=inactive]:hidden">
                {!actif && (
                  <p className="text-xs text-muted-foreground bg-muted/50 border rounded-lg px-3 py-2">
                    Étiquette inactive : configurez la règle ici ; elle ne s&apos;appliquera qu&apos;à la réactivation.
                  </p>
                )}

                <EtiquetteFormPanel
                  title="Attribution automatique"
                  description="L'étiquette est posée sur les fiches qui correspondent aux critères"
                >
                  <div className="flex items-center justify-between">
                    <Label htmlFor="is-auto" className="text-sm font-medium">
                      Activer la règle automatique
                    </Label>
                    <Switch id="is-auto" checked={isAuto} onCheckedChange={setIsAuto} />
                  </div>

                  {isAuto && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Qui reçoit l&apos;étiquette ?</Label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => {
                              setUseGroupRule(false);
                              setSegmentId(null);
                            }}
                            className={cn(
                              "rounded-lg border p-3 text-left transition-colors",
                              "hover:border-primary/40 hover:bg-muted/40",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                              !useGroupRule &&
                                "border-primary bg-primary/5 ring-1 ring-primary/20"
                            )}
                          >
                            <Tag className="h-4 w-4 mb-1.5 text-primary" />
                            <p className="text-sm font-medium">Sur cette étiquette</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                              Recommandé — délai, dates, catégories…
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => setUseGroupRule(true)}
                            className={cn(
                              "rounded-lg border p-3 text-left transition-colors",
                              "hover:border-primary/40 hover:bg-muted/40",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                              useGroupRule &&
                                "border-primary bg-primary/5 ring-1 ring-primary/20"
                            )}
                          >
                            <Users className="h-4 w-4 mb-1.5 text-muted-foreground" />
                            <p className="text-sm font-medium">Groupe de contacts</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                              Liste filtrée partagée entre plusieurs étiquettes
                            </p>
                          </button>
                        </div>
                      </div>

                      {useGroupRule ? (
                        <div className="space-y-4">
                          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2 leading-relaxed">
                            La règle est <strong>définie dans le groupe</strong>, pas sur cette
                            fiche. Cette étiquette ne fait que poser le badge sur les contacts du
                            groupe — pour créer ou modifier la règle, utilisez l&apos;onglet{" "}
                            <strong>Groupes de contacts</strong>.
                          </p>
                          <div className="space-y-2">
                            <Label htmlFor="rule-group">Groupe à utiliser</Label>
                            <div className="flex gap-2">
                              <Select
                                value={segmentId != null ? String(segmentId) : ""}
                                onValueChange={(v) => {
                                  setSegmentId(parseInt(v, 10));
                                  setUseComboRule(false);
                                  if (fieldHighlight === "rule-group") setFieldHighlight(null);
                                }}
                              >
                                <SelectTrigger
                                  id="rule-group"
                                  className={cn(
                                    "flex-1",
                                    fieldHighlight === "rule-group" &&
                                      "ring-2 ring-destructive ring-offset-2 ring-offset-background"
                                  )}
                                >
                                  <SelectValue placeholder="Choisir un groupe…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {segments.length === 0 ? (
                                    <p className="px-2 py-3 text-xs text-muted-foreground text-center">
                                      Aucun groupe — créez-en un avec le bouton +
                                    </p>
                                  ) : (
                                    segments.map((s) => (
                                      <SelectItem key={s.id} value={String(s.id)}>
                                        {s.nom}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                title="Créer un groupe de contacts"
                                onClick={() => setSegmentFormOpen(true)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {onOpenSegmentsTab && (
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 text-xs font-normal"
                              onClick={onOpenSegmentsTab}
                            >
                              Gérer les groupes de contacts →
                            </Button>
                          )}
                          {selectedSegmentRuleJson && (
                            <SegmentRulePreview ruleJson={selectedSegmentRuleJson} />
                          )}
                        </div>
                      ) : useComboRule ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5">
                            <div>
                              <p className="text-sm font-medium">Règle combinée (ET / OU)</p>
                              <p className="text-xs text-muted-foreground">
                                Désactivez pour revenir à une condition simple.
                              </p>
                            </div>
                            <Switch
                              id="combo-rule"
                              checked={useComboRule}
                              onCheckedChange={(c) => setUseComboRule(c)}
                            />
                          </div>
                          <ConditionBuilder
                            op={ruleOp}
                            onOpChange={setRuleOp}
                            children={ruleChildren}
                            onChange={(next) => {
                              setRuleChildren(next);
                              setHighlightRuleLeafIndex(null);
                            }}
                            etiquettesOptions={allEtiquettes}
                            customFieldsOptions={customFields}
                            showPreview
                            highlightRuleLeafIndex={highlightRuleLeafIndex}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label>Type de condition</Label>
                            <Select
                              value={conditionType}
                              onValueChange={(v) => {
                                setConditionType(v);
                                if (v === "EVENEMENT_SOUSCRIPTION") {
                                  setIsAuto(true);
                                  if (emailActif) setEmailEnvoiMode("eligibility");
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Choisir une condition" />
                              </SelectTrigger>
                              <SelectContent>
                                {CONDITION_TYPES_ORDER.map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {CONDITION_TYPE_LABELS[t]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {conditionType === "DATE_APPROCHE_INVESTISSEMENT" && (
                              <p className="text-xs text-muted-foreground">
                                Produits du contact et du foyer commun pris en compte.
                              </p>
                            )}
                          </div>

                {/* Paramètres selon le type */}
                {conditionType === "EVENEMENT_SOUSCRIPTION" && (
                  <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <EtiquetteSouscriptionGuide />
                    <p className="text-xs text-muted-foreground">
                      Déclencheur : enregistrement d&apos;un investissement avec date de souscription
                      sur la fiche contact. Pour envoyer un mail, onglet{" "}
                      <strong>Campagne email</strong> (via cette étiquette).
                    </p>
                    <div className="space-y-2">
                      <Label>Types de produit (vide = tous)</Label>
                      <div className="max-h-36 overflow-y-auto border rounded-md p-2 flex flex-wrap gap-2 bg-background">
                        {INVESTISSEMENT_TYPE_GROUPS.flatMap((g) => g.types).map((t) => (
                          <div key={t.value} className="flex items-center gap-1.5">
                            <Checkbox
                              id={`evt-${t.value}`}
                              checked={eventTypesProduit.includes(t.value)}
                              onCheckedChange={() =>
                                toggleTypeInList(t.value, setEventTypesProduit)
                              }
                            />
                            <Label htmlFor={`evt-${t.value}`} className="text-xs font-normal cursor-pointer">
                              {t.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <SouscriptionRepeatModeRadios
                      variant="etiquette"
                      name="repeat-souscription-etiquette"
                      eachInvestissement={eventAChaqueSouscription}
                      onChange={setEventAChaqueSouscription}
                    />
                  </div>
                )}

                {conditionType === "DELAI_SANS_CONTACT" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Nombre de jours sans contact</Label>
                      <Input
                        type="number"
                        min={1}
                        value={delaiJours}
                        onChange={(e) => setDelaiJours(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="inclure-sans-date"
                        checked={inclureSansDate}
                        onCheckedChange={(c) => setInclureSansDate(!!c)}
                      />
                      <Label htmlFor="inclure-sans-date" className="text-sm font-normal cursor-pointer">
                        Inclure les contacts sans date de dernier contact
                      </Label>
                    </div>
                  </div>
                )}

                {conditionType === "AGE_APPROCHE" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Âge cible</Label>
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        value={ageCible}
                        onChange={(e) => setAgeCible(parseInt(e.target.value) || 69)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dans les prochains (jours)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={ageJoursAvant}
                        onChange={(e) => setAgeJoursAvant(parseInt(e.target.value) || 30)}
                      />
                    </div>
                  </div>
                )}

                {conditionType === "DATE_APPROCHE" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Champ date</Label>
                      <Select value={champDate} onValueChange={setChampDate}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="date_prochain_suivi">Prochain suivi client</SelectItem>
                          <SelectItem value="date_prochain_suivi_filleul">Prochain suivi filleul</SelectItem>
                          <SelectItem value="date_dernier_contact_filleul">Dernier contact filleul</SelectItem>
                          <SelectItem value="date_naissance">Date de naissance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Jours avant</Label>
                      <Input
                        type="number"
                        min={1}
                        value={joursAvant}
                        onChange={(e) => setJoursAvant(parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                )}

                {conditionType === "TYPE_PRODUIT" && (
                  <TypeProduitConditionFields
                    types={typesProduitSelectionnes}
                    nomsProduit={nomsProduitSelectionnes}
                    onTypesChange={setTypesProduitSelectionnes}
                    onNomsProduitChange={setNomsProduitSelectionnes}
                    typesFieldId="rule-types-produit"
                    typesFieldHighlight={fieldHighlight === "rule-types-produit"}
                    highlightInvalid={fieldHighlight === "rule-types-produit"}
                  />
                )}

                {conditionType === "DATE_APPROCHE_INVESTISSEMENT" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Date sur l&apos;investissement</Label>
                        <Select value={invChampDate} onValueChange={setInvChampDate}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="date_fin_demembrement">
                              Fin de démembrement
                            </SelectItem>
                            <SelectItem value="date_fin_pret">Fin de prêt</SelectItem>
                            <SelectItem value="date_souscription">Date de souscription</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Dans les prochains (jours)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={invJoursAvant}
                          onChange={(e) => setInvJoursAvant(parseInt(e.target.value) || 1)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Limiter aux types (optionnel, vide = tous)</Label>
                      <div className="max-h-36 overflow-y-auto border rounded-md p-2 flex flex-wrap gap-2">
                        {INVESTISSEMENT_TYPE_GROUPS.flatMap((g) => g.types).map((t) => (
                          <div key={`inv-${t.value}`} className="flex items-center gap-1">
                            <Checkbox
                              id={`inv-type-${t.value}`}
                              checked={invTypesProduit.includes(t.value)}
                              onCheckedChange={() =>
                                toggleTypeInList(t.value, setInvTypesProduit)
                              }
                            />
                            <Label
                              htmlFor={`inv-type-${t.value}`}
                              className="text-xs font-normal cursor-pointer"
                            >
                              {t.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {conditionType === "TMI" && (
                  <div className="space-y-2">
                    <Label>Tranche(s) TMI</Label>
                    <p className="text-xs text-muted-foreground">
                      « 11 », « 11 % » et « 11% » sur la fiche sont reconnus comme équivalents.
                    </p>
                    <div id="rule-tmi">
                      <TmiTranchePicker
                        selected={tmiTranchesSelectionnees}
                        onToggle={handleTmiToggle}
                        highlight={fieldHighlight === "rule-tmi"}
                      />
                    </div>
                  </div>
                )}

                {conditionType === "IR_NET" && (
                  <div className="space-y-2">
                    <Label>IR net à payer</Label>
                    <p className="text-xs text-muted-foreground">
                      Compare le montant renseigné sur la fiche contact (ou le foyer).
                    </p>
                    <IrNetConditionFields
                      operator={irNetOperator}
                      onOperatorChange={(op) => {
                        setIrNetOperator(op);
                        if (fieldHighlight === "rule-ir-net") setFieldHighlight(null);
                      }}
                      montant={irNetMontant}
                      onMontantChange={(v) => {
                        setIrNetMontant(v);
                        if (fieldHighlight === "rule-ir-net") setFieldHighlight(null);
                      }}
                      highlight={fieldHighlight === "rule-ir-net"}
                    />
                  </div>
                )}

                {conditionType === "PERIODE_ANNEE" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Du mois de</Label>
                      <Select value={moisDebut.toString()} onValueChange={(v) => setMoisDebut(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Mois" />
                        </SelectTrigger>
                        <SelectContent>
                          {MOIS_LABELS.map((m) => (
                            <SelectItem key={m.value} value={m.value.toString()}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Au mois de</Label>
                      <Select value={moisFin.toString()} onValueChange={(v) => setMoisFin(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Mois" />
                        </SelectTrigger>
                        <SelectContent>
                          {MOIS_LABELS.map((m) => (
                            <SelectItem key={m.value} value={m.value.toString()}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                      <div className="space-y-2">
                        <Label>Catégories de contacts concernées</Label>
                        <div
                          id="rule-categories"
                          className={cn(
                            fieldHighlight === "rule-categories" &&
                              "rounded-lg ring-2 ring-destructive ring-offset-2 ring-offset-background p-1 -m-1"
                          )}
                        >
                          <CategoryTogglePills
                            categories={[...CATEGORIES_CONTACTS]}
                            selected={categoriesSelectionnees}
                            onToggle={handleCategoryToggle}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5">
                        <div>
                          <Label htmlFor="combo-rule" className="text-sm font-normal">
                            Avancé — combiner plusieurs conditions (ET / OU)
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Remplace la condition simple ci-dessus.
                          </p>
                        </div>
                        <Switch
                          id="combo-rule"
                          checked={useComboRule}
                          onCheckedChange={(c) => {
                            setUseComboRule(c);
                            if (c && ruleChildren.length === 0) {
                              setRuleChildren([
                                leafFromLegacy(
                                  conditionType,
                                  JSON.parse(
                                    stringifyConditionConfig(
                                      conditionType === "DELAI_SANS_CONTACT"
                                        ? { jours: delaiJours, inclure_sans_date: inclureSansDate }
                                        : conditionType === "TYPE_PRODUIT"
                                          ? buildTypeProduitConditionConfig(
                                              typesProduitSelectionnes,
                                              nomsProduitSelectionnes
                                            )
                                          : { types: typesProduitSelectionnes }
                                    ) || "{}"
                                  ) as Record<string, unknown>,
                                  categoriesSelectionnees
                                ),
                              ]);
                            }
                          }}
                        />
                      </div>

                      <EtiquetteRuleSummaryCard summary={ruleSummary} />
                      {templateSouscriptionDuplicateWarning && (
                        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          {templateSouscriptionDuplicateWarning}
                        </p>
                      )}
                      {rulePreviewJson && (
                        <SegmentRulePreview ruleJson={rulePreviewJson} />
                      )}
                        </>
                      )}
                    </>
                  )}
                </EtiquetteFormPanel>

                {!isAuto && (
                  <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                    Activez la règle automatique pour définir quand cette étiquette est posée sur les fiches.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="email" className="mt-0 space-y-6 data-[state=inactive]:hidden">
                <EtiquetteEmailCampaignFields
                  actif={actif}
                  emailActif={emailActif}
                  onEmailActifChange={(checked) => {
                    setEmailActif(checked);
                    if (checked && isAuto) setEmailEnvoiMode("eligibility");
                    if (checked && !emailTemplateId && templates.length > 0 && nom.trim()) {
                      const suggested = suggestTemplateIdForEtiquette(nom, templates);
                      if (suggested) setEmailTemplateId(suggested);
                    }
                  }}
                  emailTemplateId={emailTemplateId}
                  onTemplateIdChange={setEmailTemplateId}
                  emailEnvoiMode={emailEnvoiMode}
                  onEnvoiModeChange={setEmailEnvoiMode}
                  emailEnvoiHeure={emailEnvoiHeure}
                  onEnvoiHeureChange={setEmailEnvoiHeure}
                  emailEnvoiLocal={emailEnvoiLocal}
                  onEnvoiLocalChange={setEmailEnvoiLocal}
                  emailDelaiJours={emailDelaiJours}
                  onDelaiJoursChange={setEmailDelaiJours}
                  emailEnvoiJours={emailEnvoiJours}
                  onEnvoiJoursChange={setEmailEnvoiJours}
                  templates={templates}
                  nom={nom}
                  isAuto={isAuto}
                  isEventSouscription={conditionType === "EVENEMENT_SOUSCRIPTION"}
                  highlightField={fieldHighlight}
                />
              </TabsContent>

              <TabsContent value="action" className="mt-0 space-y-6 data-[state=inactive]:hidden">
                <EtiquetteTacheActionFields
                  isAuto={isAuto}
                  tacheActif={tacheActif}
                  onTacheActifChange={setTacheActif}
                  tacheTitre={tacheTitre}
                  onTacheTitreChange={setTacheTitre}
                  tachePriorite={tachePriorite}
                  onTachePrioriteChange={setTachePriorite}
                  tacheDelaiJours={tacheDelaiJours}
                  onTacheDelaiJoursChange={setTacheDelaiJours}
                  highlightField={fieldHighlight}
                />
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Pipeline de suivi</p>
                    <p className="text-xs text-muted-foreground">
                      Kanban dans Suivi → Contacts étiquetés (À traiter → Mail → RDV → Terminé).
                    </p>
                  </div>
                  <Switch checked={pipelineActif} onCheckedChange={setPipelineActif} />
                </div>
              </TabsContent>
            </div>
          </Tabs>
          ) : (
            <div className="flex-1 min-h-[8rem]" aria-hidden />
          )}

          <DialogFooter className="px-6 py-4 border-t bg-background shrink-0 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            {formUnlocked && (
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : etiquette ? "Enregistrer" : "Créer"}
            </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

      <SegmentForm
        open={segmentFormOpen}
        onOpenChange={setSegmentFormOpen}
        onSuccess={async (created) => {
          await reloadSegments();
          onSegmentsChanged?.();
          if (created?.id) {
            setSegmentId(created.id);
            setUseGroupRule(true);
            setUseComboRule(false);
            setIsAuto(true);
          }
        }}
      />
    </>
  );
}
