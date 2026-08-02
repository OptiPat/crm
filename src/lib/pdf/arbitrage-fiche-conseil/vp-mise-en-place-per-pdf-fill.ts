import { formatVpMiseEnPlaceMontantPdfText } from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-pdf-fill";
import type { VpMiseEnPlacePdfFillInput } from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-types";

/** Zone « L'allocation d'actifs et l'opération (type opération, montant ...) » sur le modèle PER. */
export const VP_MISE_EN_PLACE_PER_OPERATION_TEXT_FIELD = "Text3";

const CRM_FREQUENCE_LABEL: Record<string, string> = {
  MENSUEL: "mensuelle",
  TRIMESTRIEL: "trimestrielle",
  SEMESTRIEL: "semestrielle",
  ANNUEL: "annuelle",
};

export function buildVpMiseEnPlacePerOperationText(
  input: VpMiseEnPlacePdfFillInput
): string | null {
  const centimes = input.montantCentimes;
  if (centimes == null || centimes <= 0) return null;

  const lines = ["Type opération : Mise en place des versements programmés"];
  lines.push(`Montant : ${formatVpMiseEnPlaceMontantPdfText(centimes)} €`);

  const frequence = input.frequence?.trim().toUpperCase() ?? "";
  const label = CRM_FREQUENCE_LABEL[frequence];
  if (label) {
    lines.push(`Périodicité : ${label}`);
  }

  return lines.join("\r\n");
}

function setPdfTextField(form: import("pdf-lib").PDFForm, name: string, value: string): void {
  try {
    form.getTextField(name).setText(value);
  } catch {
    // Champ absent ou type différent.
  }
}

export function applyVpMiseEnPlacePerPdfFill(
  form: import("pdf-lib").PDFForm,
  input: VpMiseEnPlacePdfFillInput
): void {
  const text = buildVpMiseEnPlacePerOperationText(input);
  if (!text) return;
  setPdfTextField(form, VP_MISE_EN_PLACE_PER_OPERATION_TEXT_FIELD, text);
}
