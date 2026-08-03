import type { ArbitrageFicheProductKind, FicheConseilTemplateFamily } from "@/lib/api/tauri-arbitrage-fiche";
import type { FicheConseilArbitrageRedactionInput } from "@/lib/pdf/arbitrage-fiche-conseil/arbitrage-redaction-labels";
import { ARBITRAGE_AV_REDACTION_PDF_FIELDS } from "@/lib/pdf/arbitrage-fiche-conseil/arbitrage-redaction-pdf-fields";
import type { VpModificationPdfFillInput } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";
import { applyVpModificationAvPdfFill } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-pdf-fill";
import { applyVpModificationPerPdfFill } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-per-pdf-fill";
import type { VpMiseEnPlacePdfFillInput } from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-types";
import { applyVpMiseEnPlaceAvPdfFill } from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-pdf-fill";
import { applyVpMiseEnPlacePerPdfFill } from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-per-pdf-fill";

export type ArbitrageFicheConseilFillInput = {
  nomClient: string;
  prenomClient: string;
  numeroContrat?: string | null;
  arbitrageRedaction?: FicheConseilArbitrageRedactionInput;
  vpModification?: VpModificationPdfFillInput;
  vpMiseEnPlace?: VpMiseEnPlacePdfFillInput;
};

function setTextField(
  form: import("pdf-lib").PDFForm,
  name: string,
  value: string | null | undefined
) {
  const text = value?.trim();
  if (!text) return;
  try {
    form.getTextField(name).setText(text);
  } catch {
    // Champ absent ou type différent — on ignore.
  }
}

function clientFullName(input: ArbitrageFicheConseilFillInput): string {
  return `${input.nomClient} ${input.prenomClient}`.replace(/\s+/g, " ").trim();
}

export async function fillArbitrageFicheConseilPdf(
  templateBytes: Uint8Array,
  productKind: ArbitrageFicheProductKind,
  input: ArbitrageFicheConseilFillInput,
  options?: { templateFamily?: FicheConseilTemplateFamily }
): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const templateFamily = options?.templateFamily ?? "ARBITRAGE";

  if (productKind === "AV") {
    setTextField(form, "Nomclient", input.nomClient);
    setTextField(form, "Prenomclient", input.prenomClient);
    setTextField(form, "enveloppe", input.numeroContrat);
    if (templateFamily === "ARBITRAGE" && input.arbitrageRedaction) {
      const { motif, supportsDesinvestis, supportsInvestis } = input.arbitrageRedaction;
      setTextField(form, ARBITRAGE_AV_REDACTION_PDF_FIELDS.motif, motif);
      setTextField(form, ARBITRAGE_AV_REDACTION_PDF_FIELDS.supportsDesinvestis, supportsDesinvestis);
      setTextField(form, ARBITRAGE_AV_REDACTION_PDF_FIELDS.supportsInvestis, supportsInvestis);
    }
  } else {
    // PER : investisseur 1 = Nom / Prénom (champ unique), n° contrat séparé.
    setTextField(form, "invest1", clientFullName(input));
    setTextField(form, "numcontrat", input.numeroContrat);
  }

  if (templateFamily === "VP_MODIFICATION" && input.vpModification) {
    if (productKind === "AV") {
      applyVpModificationAvPdfFill(form, input.vpModification);
    } else {
      applyVpModificationPerPdfFill(form, input.vpModification);
    }
  }

  if (templateFamily === "VP_MISE_EN_PLACE" && input.vpMiseEnPlace) {
    if (productKind === "AV") {
      applyVpMiseEnPlaceAvPdfFill(form, input.vpMiseEnPlace);
    } else {
      applyVpMiseEnPlacePerPdfFill(form, input.vpMiseEnPlace);
    }
  }

  try {
    form.updateFieldAppearances();
  } catch {
    // Rendu par défaut si polices embarquées absentes.
  }

  return pdfDoc.save();
}

/** @deprecated utiliser fillArbitrageFicheConseilPdf */
export async function fillArbitrageAvFicheConseilPdf(
  templateBytes: Uint8Array,
  input: ArbitrageFicheConseilFillInput
): Promise<Uint8Array> {
  return fillArbitrageFicheConseilPdf(templateBytes, "AV", input);
}
