import { mergeTemplateVariablesField } from "@/lib/emails/template-email-trigger";

export const SCPI_BULLETIN_TEMPLATE_NOM = "Bulletin SCPI trimestriel";
export const SCPI_BULLETIN_TEMPLATE_TU_NOM = "Bulletin SCPI trimestriel (tu)";
export const SCPI_BULLETIN_TEMPLATE_VERSION = 4;

export function isScpiBulletinTemplateNom(nom: string): boolean {
  const trimmed = nom.trim();
  return (
    trimmed === SCPI_BULLETIN_TEMPLATE_NOM || trimmed === SCPI_BULLETIN_TEMPLATE_TU_NOM
  );
}

/** Empêche la migration Rust de réécraser un modèle SCPI personnalisé. */
export function stampScpiBulletinTemplateMeta(
  variables: string | null,
  templateNom: string
): string | null {
  if (!isScpiBulletinTemplateNom(templateNom)) return variables;
  return mergeTemplateVariablesField(variables, {
    scpi_template_version: SCPI_BULLETIN_TEMPLATE_VERSION,
    scpi_template_user_customized: true,
  });
}
