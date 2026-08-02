import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  applyVpMiseEnPlacePerPdfFill,
  buildVpMiseEnPlacePerOperationText,
  VP_MISE_EN_PLACE_PER_OPERATION_TEXT_FIELD,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-per-pdf-fill";

describe("vp-mise-en-place-per-pdf-fill", () => {
  it("compose le texte opération PER mise en place", () => {
    expect(
      buildVpMiseEnPlacePerOperationText({
        montantCentimes: 100_00,
        frequence: "TRIMESTRIEL",
      })
    ).toBe(
      "Type opération : Mise en place des versements programmés\r\nMontant : 100 €\r\nPériodicité : trimestrielle"
    );
  });

  it("remplit Text3 sur le modèle PER", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    form.createTextField(VP_MISE_EN_PLACE_PER_OPERATION_TEXT_FIELD).addToPage(page, {
      x: 10,
      y: 10,
      width: 200,
      height: 80,
    });

    applyVpMiseEnPlacePerPdfFill(form, {
      montantCentimes: 150_00,
      frequence: "MENSUEL",
    });

    expect(form.getTextField(VP_MISE_EN_PLACE_PER_OPERATION_TEXT_FIELD).getText()).toContain(
      "Mise en place des versements programmés"
    );
    expect(form.getTextField(VP_MISE_EN_PLACE_PER_OPERATION_TEXT_FIELD).getText()).toContain(
      "Montant : 150 €"
    );
  });
});
