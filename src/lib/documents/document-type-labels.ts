/** Libellés UI des valeurs `type_document` (code DB inchangé). */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  IDENTITE: "Pièce d'identité / Passeport",
  FISCAL: "Document fiscal",
  PATRIMOINE: "RIO / relevé patrimonial",
  CONTRAT: "Contrat",
  RELEVE: "Relevé",
  AUTRE: "Autre",
};

export function getDocumentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}
