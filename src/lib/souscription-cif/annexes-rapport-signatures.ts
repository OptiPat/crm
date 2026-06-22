/** Bloc « Fait à » + signatures — annexes SCPI et Capital investissement (après § 7). */

import {
  renderTemplateLines,
  renderTemplateSegments,
  type SouscriptionPreviewSegment,
} from "@/lib/souscription-cif/render-template";

export const ANNEXES_RAPPORT_FAIT_A = `Fait à {{client_ville}}, le {{date_document}}.`;

export const ANNEXES_RAPPORT_SIGNATURE_LEFT = `Signature du conseiller :

« Lu et Approuvé »

{{cgp_nom_complet}}`;

export const ANNEXES_RAPPORT_SIGNATURE_RIGHT = `Signature du client :

Certifie sur l'honneur l'exactitude des renseignements fournis sur le présent document

{{client_nom_prenom}}`;

export function buildAnnexesRapportFaitASegments(
  variables: Record<string, string | null>
): SouscriptionPreviewSegment[] {
  return renderTemplateSegments(ANNEXES_RAPPORT_FAIT_A, variables);
}

export function buildAnnexesRapportSignatureColumns(
  variables: Record<string, string | null>
): {
  left: SouscriptionPreviewSegment[][];
  right: SouscriptionPreviewSegment[][];
} {
  return {
    left: renderTemplateLines(ANNEXES_RAPPORT_SIGNATURE_LEFT, variables),
    right: renderTemplateLines(ANNEXES_RAPPORT_SIGNATURE_RIGHT, variables),
  };
}
