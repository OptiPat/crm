import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  applyVpModificationPerPdfFill,
  buildVpModificationPerOperationText,
  VP_MODIFICATION_PER_OPERATION_TEXT_FIELD,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-per-pdf-fill";

describe("vp-modification-per-pdf-fill", () => {
  it("compose le texte opération PER", () => {
    expect(
      buildVpModificationPerOperationText({
        kinds: ["montant", "periodicite"],
        montantCentimes: 200_00,
        frequence: "MENSUEL",
      })
    ).toBe(
      "Type opération : Modification des versements programmés\r\nMontant : 200 €\r\nPériodicité : mensuelle"
    );
  });

  it("remplit Text3 sur le modèle PER", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    form.createTextField(VP_MODIFICATION_PER_OPERATION_TEXT_FIELD).addToPage(page, {
      x: 10,
      y: 10,
      width: 200,
      height: 80,
    });

    applyVpModificationPerPdfFill(form, {
      kinds: ["allocation"],
    });

    expect(
      form.getTextField(VP_MODIFICATION_PER_OPERATION_TEXT_FIELD).getText()
    ).toContain("Vos versements programmés s'effectueront sur une allocation différente");
  });
});
