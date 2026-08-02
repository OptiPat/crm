import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  applyVpModificationAvPdfFill,
  formatVpModificationMontantPdfText,
  VP_MODIFICATION_ALLOC_CHECKBOX_FIELD,
  VP_MODIFICATION_MONTANT_CHECKBOX_FIELD,
  VP_MODIFICATION_MONTANT_TEXT_FIELD,
  VP_MODIFICATION_PERIO_CHECKBOX_FIELD,
  VP_MODIFICATION_PERIO_DROPDOWN_FIELD,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-pdf-fill";

async function makeVpAvTemplate(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const form = doc.getForm();
  form.createCheckBox(VP_MODIFICATION_ALLOC_CHECKBOX_FIELD).addToPage(page, { x: 40, y: 50 });
  form.createCheckBox(VP_MODIFICATION_PERIO_CHECKBOX_FIELD).addToPage(page, { x: 40, y: 70 });
  form
    .createDropdown(VP_MODIFICATION_PERIO_DROPDOWN_FIELD)
    .addOptions(["Mensuel", "Trimestriel", "Semestriel", "Annuel"]);
  form.getDropdown(VP_MODIFICATION_PERIO_DROPDOWN_FIELD).addToPage(page, { x: 80, y: 70 });
  form.createCheckBox(VP_MODIFICATION_MONTANT_CHECKBOX_FIELD).addToPage(page, { x: 50, y: 90 });
  form.createTextField(VP_MODIFICATION_MONTANT_TEXT_FIELD).addToPage(page, { x: 80, y: 90 });
  return doc.save();
}

describe("vp-modification-pdf-fill", () => {
  it("formate le montant VP pour le PDF", () => {
    expect(formatVpModificationMontantPdfText(150_00)).toBe("150");
    expect(formatVpModificationMontantPdfText(150_50)).toBe("150,50");
  });

  it("coche allocation seule sans montant", async () => {
    const doc = await PDFDocument.load(await makeVpAvTemplate());
    const form = doc.getForm();
    applyVpModificationAvPdfFill(form, { kinds: ["allocation"] });
    expect(form.getCheckBox(VP_MODIFICATION_ALLOC_CHECKBOX_FIELD).isChecked()).toBe(true);
    expect(form.getCheckBox(VP_MODIFICATION_MONTANT_CHECKBOX_FIELD).isChecked()).toBe(false);
  });

  it("coche montant et remplit mttvp2", async () => {
    const doc = await PDFDocument.load(await makeVpAvTemplate());
    const form = doc.getForm();
    applyVpModificationAvPdfFill(form, {
      kinds: ["montant"],
      montantCentimes: 250_00,
    });
    expect(form.getCheckBox(VP_MODIFICATION_MONTANT_CHECKBOX_FIELD).isChecked()).toBe(true);
    expect(form.getTextField(VP_MODIFICATION_MONTANT_TEXT_FIELD).getText()).toBe("250");
  });

  it("coche périodicité et remplit le dropdown", async () => {
    const doc = await PDFDocument.load(await makeVpAvTemplate());
    const form = doc.getForm();
    applyVpModificationAvPdfFill(form, {
      kinds: ["periodicite"],
      frequence: "TRIMESTRIEL",
    });
    expect(form.getCheckBox(VP_MODIFICATION_PERIO_CHECKBOX_FIELD).isChecked()).toBe(true);
    expect(form.getDropdown(VP_MODIFICATION_PERIO_DROPDOWN_FIELD).getSelected()[0]).toBe(
      "Trimestriel"
    );
  });
});
