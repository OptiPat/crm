import { formatMontantCentimesInput } from "@/lib/pipe/placement-montant";
import type { VpModificationPdfFillInput } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";

export const VP_MODIFICATION_MONTANT_CHECKBOX_FIELD = "Case montant";
export const VP_MODIFICATION_MONTANT_TEXT_FIELD = "mttvp2";
export const VP_MODIFICATION_ALLOC_CHECKBOX_FIELD = "Case alloc";
export const VP_MODIFICATION_PERIO_CHECKBOX_FIELD = "Case pério";
export const VP_MODIFICATION_PERIO_DROPDOWN_FIELD = "Dropdownx";

const PDF_FREQUENCE_BY_CRM: Record<string, string> = {
  MENSUEL: "Mensuel",
  TRIMESTRIEL: "Trimestriel",
  SEMESTRIEL: "Semestriel",
  ANNUEL: "Annuel",
};

export type { VpModificationPdfFillInput };

export function formatVpModificationMontantPdfText(centimes: number): string {
  return formatMontantCentimesInput(centimes);
}

function checkPdfCheckbox(form: import("pdf-lib").PDFForm, name: string): void {
  try {
    form.getCheckBox(name).check();
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

export function applyVpModificationAvPdfFill(
  form: import("pdf-lib").PDFForm,
  input: VpModificationPdfFillInput
): void {
  if (input.kinds.includes("allocation")) {
    checkPdfCheckbox(form, VP_MODIFICATION_ALLOC_CHECKBOX_FIELD);
  }

  if (input.kinds.includes("periodicite")) {
    checkPdfCheckbox(form, VP_MODIFICATION_PERIO_CHECKBOX_FIELD);
    const frequence = input.frequence?.trim().toUpperCase() ?? "";
    const pdfFrequence = PDF_FREQUENCE_BY_CRM[frequence];
    if (pdfFrequence) {
      setPdfDropdown(form, VP_MODIFICATION_PERIO_DROPDOWN_FIELD, pdfFrequence);
    }
  }

  if (!input.kinds.includes("montant")) return;

  checkPdfCheckbox(form, VP_MODIFICATION_MONTANT_CHECKBOX_FIELD);

  const centimes = input.montantCentimes;
  if (centimes == null || centimes <= 0) return;

  setPdfTextField(
    form,
    VP_MODIFICATION_MONTANT_TEXT_FIELD,
    formatVpModificationMontantPdfText(centimes)
  );
}
