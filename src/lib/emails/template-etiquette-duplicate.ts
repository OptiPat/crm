import type { Etiquette } from "@/lib/api/tauri-etiquettes";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { parseTemplateEmailTrigger } from "@/lib/emails/template-email-trigger";

/** Étiquettes actives « souscription » qui utilisent déjà ce modèle. */
export function etiquettesSouscriptionDuplicateForTemplate(
  templateId: number,
  etiquettes: Etiquette[]
): Etiquette[] {
  return etiquettes.filter(
    (e) =>
      e.actif &&
      e.auto_condition_type === "EVENEMENT_SOUSCRIPTION" &&
      e.email_template_id === templateId
  );
}

export function templateHasSouscriptionTrigger(
  template: Pick<TemplateEmail, "variables"> | null | undefined
): boolean {
  if (!template) return false;
  const t = parseTemplateEmailTrigger(template.variables);
  return t.enabled && t.condition_type === "EVENEMENT_SOUSCRIPTION";
}

export function formatSouscriptionDuplicateWarning(
  templateNom: string,
  etiquetteNoms: string[]
): string {
  if (etiquetteNoms.length === 0) return "";
  const list =
    etiquetteNoms.length <= 3
      ? etiquetteNoms.join(", ")
      : `${etiquetteNoms.slice(0, 3).join(", ")} (+${etiquetteNoms.length - 3})`;
  return `Le modèle « ${templateNom} » a un déclencheur « nouvelle souscription » et ${
    etiquetteNoms.length > 1 ? "les étiquettes" : "l'étiquette"
  } ${list} aussi : un contact peut apparaître deux fois dans Suivi → Envois. Désactivez l'un des deux chemins.`;
}
