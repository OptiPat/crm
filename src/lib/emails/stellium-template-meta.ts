import { mergeTemplateVariablesField } from "@/lib/emails/template-email-trigger";
import {
  STELLIUM_PERF_TEMPLATE_NOM,
  STELLIUM_PERF_TEMPLATE_TU_NOM,
} from "@/lib/investissements/stellium-perf-campaign";

export { STELLIUM_PERF_TEMPLATE_NOM, STELLIUM_PERF_TEMPLATE_TU_NOM };

/** Aligné sur `STELLIUM_TEMPLATE_VERSION` (Rust). */
export const STELLIUM_PERF_TEMPLATE_VERSION = 6;

/** Variables injectées à la préparation — modèle simple : intro + bloc détail. */
export const STELLIUM_PERF_TEMPLATE_VARIABLES: {
  token: string;
  label: string;
  hint: string;
}[] = [
  {
    token: "{{perf_intro_vous}}",
    label: "Intro (vous)",
    hint: "Phrase d'accroche auto (1 ou N contrats, mineurs…)",
  },
  {
    token: "{{perf_intro_tu}}",
    label: "Intro (tu)",
    hint: "Variante tutoiement de l'intro",
  },
  {
    token: "{{perf_detail}}",
    label: "Détail contrats (vous)",
    hint: "Tous les contrats + chiffres — texte brut",
  },
  {
    token: "{{perf_detail_tu}}",
    label: "Détail contrats (tu)",
    hint: "Tous les contrats + chiffres — tutoiement",
  },
  {
    token: "{{perf_detail_html}}",
    label: "Détail contrats HTML (vous)",
    hint: "Bloc HTML complet pour le corps du mail",
  },
  {
    token: "{{perf_detail_html_tu}}",
    label: "Détail contrats HTML (tu)",
    hint: "Bloc HTML tutoiement",
  },
  {
    token: "{{releve_date_label}}",
    label: "Date relevé (phrase)",
    hint: "Ex. au 20/06/2026 — aussi dans l'intro",
  },
  {
    token: "{{periode}}",
    label: "Période",
    hint: "Ex. Juin 2026 — objet",
  },
  {
    token: "{{beneficiary_prenom}}",
    label: "Prénom bénéficiaire",
    hint: "Objet / mineurs",
  },
  {
    token: "{{beneficiary_nom}}",
    label: "Nom bénéficiaire",
    hint: "Objet / mineurs",
  },
];

export function isStelliumPerfTemplateNom(nom: string): boolean {
  const trimmed = nom.trim();
  return trimmed === STELLIUM_PERF_TEMPLATE_NOM || trimmed === STELLIUM_PERF_TEMPLATE_TU_NOM;
}

/** Empêche la migration Rust de réécraser un modèle perf Stellium personnalisé. */
export function stampStelliumPerfTemplateMeta(
  variables: string | null,
  templateNom: string
): string | null {
  if (!isStelliumPerfTemplateNom(templateNom)) return variables;
  return mergeTemplateVariablesField(variables, {
    stellium_perf_template_version: STELLIUM_PERF_TEMPLATE_VERSION,
    stellium_perf_template_user_customized: true,
  });
}
