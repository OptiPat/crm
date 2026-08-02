import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  applyVpMiseEnPlaceAvPdfFill,
  VP_MISE_EN_PLACE_MONTANT_TEXT_FIELD,
  VP_MISE_EN_PLACE_OUI_RADIO_FIELD,
  VP_MISE_EN_PLACE_OUI_RADIO_VALUE,
  VP_MISE_EN_PLACE_PERIO_DROPDOWN_FIELD,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-pdf-fill";

async function createVpMiseEnPlaceForm() {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const form = doc.getForm();
  form.createRadioGroup(VP_MISE_EN_PLACE_OUI_RADIO_FIELD).addOptionToPage("1", page, { x: 50, y: 700 });
  form
    .getRadioGroup(VP_MISE_EN_PLACE_OUI_RADIO_FIELD)
    .addOptionToPage("2", page, { x: 80, y: 700 });
  form.createTextField(VP_MISE_EN_PLACE_MONTANT_TEXT_FIELD).addToPage(page, { x: 50, y: 680 });
  form
    .createDropdown(VP_MISE_EN_PLACE_PERIO_DROPDOWN_FIELD)
    .addOptions(["Mensuel", "Trimestriel", "Semestriel", "Annuel"]);
  form.getDropdown(VP_MISE_EN_PLACE_PERIO_DROPDOWN_FIELD).addToPage(page, { x: 50, y: 660 });
  return form;
}

describe("vp-mise-en-place-pdf-fill", () => {
  it("coche Oui, remplit mttvp et Dropdown4", async () => {
    const form = await createVpMiseEnPlaceForm();
    applyVpMiseEnPlaceAvPdfFill(form, {
      montantCentimes: 15000,
      frequence: "TRIMESTRIEL",
    });
    expect(form.getRadioGroup(VP_MISE_EN_PLACE_OUI_RADIO_FIELD).getSelected()).toBe(
      VP_MISE_EN_PLACE_OUI_RADIO_VALUE
    );
    expect(form.getTextField(VP_MISE_EN_PLACE_MONTANT_TEXT_FIELD).getText()).toBe("150");
    expect(form.getDropdown(VP_MISE_EN_PLACE_PERIO_DROPDOWN_FIELD).getSelected()[0]).toBe(
      "Trimestriel"
    );
  });
});
