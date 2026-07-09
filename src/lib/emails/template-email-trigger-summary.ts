import {
  parseConditionConfig,
  type ConditionAgeApproche,
  type ConditionDateApproche,
  type ConditionDateApprocheInvestissement,
  type ConditionDelaiSansContact,
  type ConditionEvenementSouscription,
  type ConditionPeriodeAnnee,
  type ConditionTypeProduit,
} from "@/lib/api/tauri-etiquettes";
import {
  emailEnvoiJoursSemaineLabel,
  parseEmailEnvoiJoursSemaine,
  EMAIL_ENVOI_JOUR_OPTIONS,
} from "@/lib/emails/email-envoi-schedule";
import type { TemplateEmailTriggerConfig } from "@/lib/emails/template-email-trigger";
import {
  formatEtiquetteRuleSummary,
  type EtiquetteRuleSummaryInput,
} from "@/lib/etiquettes/etiquette-form-summary";
import { formatRuleTreeBrief } from "@/lib/etiquettes/etiquette-card-summary";
import {
  parseConditionIrNetConfig,
  parseConditionRevenusAnnuelsConfig,
  parseConditionTmiConfig,
} from "@/lib/etiquettes/fiscal-tmi";
import { isTriggerRuleTree } from "@/lib/emails/template-email-trigger-rule-tree";

function buildTriggerSummaryInput(
  trigger: Pick<
    TemplateEmailTriggerConfig,
    "condition_type" | "condition_config" | "categories" | "a_chaque_souscription"
  >
): EtiquetteRuleSummaryInput | null {
  const type = trigger.condition_type;
  if (!type || isTriggerRuleTree(type)) return null;

  const categories = trigger.categories;
  const base: EtiquetteRuleSummaryInput = {
    isAuto: true,
    conditionType: type,
    delaiJours: 365,
    inclureSansDate: true,
    ageCible: 69,
    ageJoursAvant: 30,
    champDate: "date_prochain_suivi",
    joursAvant: 30,
    moisDebut: 4,
    moisFin: 5,
    typesProduitCount: 0,
    nomsProduitCount: 0,
    invChampDate: "date_fin_demembrement",
    invJoursAvant: 180,
    invTypesProduitCount: 0,
    tmiTranches: [],
    irNetOperator: "gte",
    irNetMontant: null,
    revenusAnnuelsOperator: "gte",
    revenusAnnuelsMontant: null,
    categories,
    repeatEntity: "envoi",
  };

  if (type === "DELAI_SANS_CONTACT") {
    const config = parseConditionConfig<ConditionDelaiSansContact>(trigger.condition_config);
    if (config) {
      base.delaiJours = config.jours;
      base.inclureSansDate = config.inclure_sans_date !== false;
    }
  } else if (type === "AGE_APPROCHE") {
    const config = parseConditionConfig<ConditionAgeApproche>(trigger.condition_config);
    if (config) {
      base.ageCible = config.age;
      base.ageJoursAvant = config.jours_avant;
    }
  } else if (type === "DATE_APPROCHE") {
    const config = parseConditionConfig<ConditionDateApproche>(trigger.condition_config);
    if (config) {
      base.champDate = config.champ;
      base.joursAvant = config.jours_avant;
    }
  } else if (type === "PERIODE_ANNEE") {
    const config = parseConditionConfig<ConditionPeriodeAnnee>(trigger.condition_config);
    if (config) {
      base.moisDebut = config.mois_debut;
      base.moisFin = config.mois_fin;
    }
  } else if (type === "TYPE_PRODUIT") {
    const config = parseConditionConfig<ConditionTypeProduit>(trigger.condition_config);
    base.typesProduitCount = config?.types?.length ?? 0;
    base.nomsProduitCount = config?.noms_produit?.length ?? 0;
  } else if (type === "DATE_APPROCHE_INVESTISSEMENT") {
    const config = parseConditionConfig<ConditionDateApprocheInvestissement>(
      trigger.condition_config
    );
    if (config) {
      base.invChampDate = config.champ;
      base.invJoursAvant = config.jours_avant;
      base.invTypesProduitCount = config.types_produit?.length ?? 0;
    }
  } else if (type === "EVENEMENT_SOUSCRIPTION") {
    const config = parseConditionConfig<ConditionEvenementSouscription>(trigger.condition_config);
    base.eventTypesProduitCount = config?.types?.length ?? 0;
    base.aChaqueSouscription =
      config?.a_chaque_souscription ?? trigger.a_chaque_souscription;
  } else if (type === "TMI") {
    const config = parseConditionTmiConfig(trigger.condition_config);
    base.tmiTranches = config?.tranches ?? [];
  } else if (type === "IR_NET") {
    const config = parseConditionIrNetConfig(trigger.condition_config);
    if (config) {
      base.irNetOperator = config.operator;
      base.irNetMontant = config.montant;
    }
  } else if (type === "REVENUS_ANNUELS") {
    const config = parseConditionRevenusAnnuelsConfig(trigger.condition_config);
    if (config) {
      base.revenusAnnuelsOperator = config.operator;
      base.revenusAnnuelsMontant = config.montant;
    }
  }

  return base;
}

export function formatTemplateEmailTriggerScheduleLabel(
  trigger: Pick<TemplateEmailTriggerConfig, "delai_jours" | "envoi_heure" | "envoi_jours_semaine">
): string {
  const delay =
    trigger.delai_jours > 0
      ? `${trigger.delai_jours} jour${trigger.delai_jours > 1 ? "s" : ""} après le déclenchement`
      : "le jour du déclenchement";
  const time = trigger.envoi_heure?.trim() || "09:00";
  const weekday = emailEnvoiJoursSemaineLabel(trigger.envoi_jours_semaine);
  if (weekday) {
    return `${delay}, puis ${weekday} à ${time}`;
  }
  return `${delay} à ${time}`;
}

/** Libellé court pour badge bibliothèque, ex. « J+45 · 19:00 · mer ». */
export function formatTemplateEmailTriggerScheduleBadge(
  trigger: Pick<TemplateEmailTriggerConfig, "delai_jours" | "envoi_heure" | "envoi_jours_semaine">
): string | null {
  const parts: string[] = [];
  if (trigger.delai_jours > 0) {
    parts.push(`J+${trigger.delai_jours}`);
  }
  const time = trigger.envoi_heure?.trim().slice(0, 5);
  if (time) parts.push(time);
  const days = parseEmailEnvoiJoursSemaine(trigger.envoi_jours_semaine);
  if (days?.length) {
    const label = EMAIL_ENVOI_JOUR_OPTIONS.find((o) => o.code === days[0])?.label;
    if (label) parts.push(label.toLowerCase());
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatTemplateEmailTriggerSummary(
  trigger: TemplateEmailTriggerConfig
): string | null {
  if (!trigger.enabled || !trigger.condition_type?.trim()) return null;

  let rulePart: string;
  if (isTriggerRuleTree(trigger.condition_type)) {
    rulePart =
      formatRuleTreeBrief(trigger.condition_config) ?? "Règle combinée à configurer";
  } else {
    const input = buildTriggerSummaryInput(trigger);
    rulePart = input
      ? formatEtiquetteRuleSummary(input)
      : "Paramètres du déclencheur à compléter.";
  }

  const schedule = formatTemplateEmailTriggerScheduleLabel(trigger);
  return `${rulePart} Proposition dans Suivi → Envois : ${schedule}.`;
}
