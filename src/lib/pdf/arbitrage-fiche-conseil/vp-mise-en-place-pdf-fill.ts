import { formatMontantCentimesInput } from "@/lib/pipe/placement-montant";
import type { VpMiseEnPlacePdfFillInput } from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-types";

export const VP_MISE_EN_PLACE_OUI_RADIO_FIELD = "CocheVP";
/** Valeur export « Oui » (case gauche) sur les modèles AV VP. */
export const VP_MISE_EN_PLACE_OUI_RADIO_VALUE = "1";
export const VP_MISE_EN_PLACE_MONTANT_TEXT_FIELD = "mttvp";
export const VP_MISE_EN_PLACE_PERIO_DROPDOWN_FIELD = "Dropdown4";

const PDF_FREQUENCE_BY_CRM: Record<string, string> = {
  MENSUEL: "Mensuel",
  TRIMESTRIEL: "Trimestriel",
  SEMESTRIEL: "Semestriel",
  ANNUEL: "Annuel",
};

export type { VpMiseEnPlacePdfFillInput };

export function formatVpMiseEnPlaceMontantPdfText(centimes: number): string {
  return formatMontantCentimesInput(centimes);
}

function selectPdfRadio(form: import("pdf-lib").PDFForm, name: string, value: string): void {
  try {
    form.getRadioGroup(name).select(value);
  } catch {
    // Champ absent sur un modèle plus ancien.
  }
}

function setPdfDropdown(form: import("pdf-lib").PDFForm, name: string, value: string): void {
  try {
    form.getDropdown(name).select(value);
  } catch {
    // Champ absent ou valeur non listée.
  }
}

function setPdfTextField(form: import("pdf-lib").PDFForm, name: string, value: string): void {
  try {
    form.getTextField(name).setText(value);
  } catch {
    // Champ absent ou type différent.
  }
}

export function applyVpMiseEnPlaceAvPdfFill(
  form: import("pdf-lib").PDFForm,
  input: VpMiseEnPlacePdfFillInput
): void {
  const centimes = input.montantCentimes;
  if (centimes == null || centimes <= 0) return;

  selectPdfRadio(form, VP_MISE_EN_PLACE_OUI_RADIO_FIELD, VP_MISE_EN_PLACE_OUI_RADIO_VALUE);

  setPdfTextField(
    form,
    VP_MISE_EN_PLACE_MONTANT_TEXT_FIELD,
    formatVpMiseEnPlaceMontantPdfText(centimes)
  );

  const frequence = input.frequence?.trim().toUpperCase() ?? "";
  const pdfFrequence = PDF_FREQUENCE_BY_CRM[frequence];
  if (pdfFrequence) {
    setPdfDropdown(form, VP_MISE_EN_PLACE_PERIO_DROPDOWN_FIELD, pdfFrequence);
  }
}
