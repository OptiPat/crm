/** Libellé dossier client : NOM Prénom (convention CRM). */
export function formatClientFolderName(nom: string, prenom: string): string {
  return `${nom.trim()} ${prenom.trim()}`.trim();
}
