import { parseTemplateEmailPlacementConformeTrigger } from "@/lib/emails/template-email-placement-conforme";

const PLACEMENT_CONFORME_ONLY_VAR_KEYS = [
  "libelle_stellium",
  "libelle_client",
  "type_operation",
  "date_operation",
] as const;

/** Valeurs fictives pour l'aperçu des modèles Box Placement (opération conforme). */
export const SAMPLE_PLACEMENT_CONFORME_PREVIEW_VARS: Record<string, string> = {
  libelle_stellium: "Arbitrage libre",
  libelle_client: "l'arbitrage",
  produit: "Cristalliance Evoluvie",
  type_operation: "Arbitrage libre",
  date_operation: "lundi 14 juillet 2026",
};

function haystack(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join("\n");
}

export function templateTextUsesPlacementConformeVariables(
  sujet: string,
  corps: string,
  corpsHtml?: string | null
): boolean {
  const hay = haystack(sujet, corps, corpsHtml);
  return PLACEMENT_CONFORME_ONLY_VAR_KEYS.some((key) => hay.includes(`{{${key}}}`));
}

/** Active l'aperçu Box Placement (évite la collision `{{produit}}` avec Stellium perf). */
export function shouldUsePlacementConformePreview(
  sujet: string,
  corps: string,
  corpsHtml?: string | null,
  templateVariables?: string | null,
  placementConformeTriggerEnabled?: boolean
): boolean {
  if (placementConformeTriggerEnabled) return true;
  if (parseTemplateEmailPlacementConformeTrigger(templateVariables).enabled) {
    return true;
  }
  return templateTextUsesPlacementConformeVariables(sujet, corps, corpsHtml);
}
