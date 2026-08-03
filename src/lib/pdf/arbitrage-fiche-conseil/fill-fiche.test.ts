import { describe, expect, it } from "vitest";
import { fillArbitrageFicheConseilPdf } from "@/lib/pdf/arbitrage-fiche-conseil/fill-fiche";
import { ARBITRAGE_AV_REDACTION_PDF_FIELDS } from "@/lib/pdf/arbitrage-fiche-conseil/arbitrage-redaction-pdf-fields";
import {
  VP_MODIFICATION_MONTANT_CHECKBOX_FIELD,
  VP_MODIFICATION_MONTANT_TEXT_FIELD,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-pdf-fill";
import { VP_MODIFICATION_PER_OPERATION_TEXT_FIELD } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-per-pdf-fill";
import {
  VP_MISE_EN_PLACE_MONTANT_TEXT_FIELD,
  VP_MISE_EN_PLACE_OUI_RADIO_FIELD,
  VP_MISE_EN_PLACE_OUI_RADIO_VALUE,
  VP_MISE_EN_PLACE_PERIO_DROPDOWN_FIELD,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-pdf-fill";
import { VP_MISE_EN_PLACE_PER_OPERATION_TEXT_FIELD } from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-per-pdf-fill";
import { PDFDocument } from "pdf-lib";

async function makeAvVpModificationTemplate(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const form = doc.getForm();
  form.createTextField("Nomclient").addToPage(page, { x: 50, y: 200 });
  form.createTextField("Prenomclient").addToPage(page, { x: 50, y: 180 });
  form.createTextField("enveloppe").addToPage(page, { x: 50, y: 160 });
  form.createCheckBox(VP_MODIFICATION_MONTANT_CHECKBOX_FIELD).addToPage(page, { x: 50, y: 50 });
  form.createTextField(VP_MODIFICATION_MONTANT_TEXT_FIELD).addToPage(page, { x: 50, y: 70 });
  return doc.save();
}

async function makeAvTemplate(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const form = doc.getForm();
  form.createTextField("Nomclient");
  form.createTextField("Prenomclient");
  form.createTextField("enveloppe");
  form.createTextField("Nomconsultant");
  return doc.save();
}

async function makePerTemplate(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const form = doc.getForm();
  form.createTextField("invest1");
  form.createTextField("numcontrat");
  form.createTextField("nomcslt");
  return doc.save();
}

const input = {
  nomClient: "DUPONT",
  prenomClient: "Jean",
  numeroContrat: "AV-123456",
};

describe("fillArbitrageFicheConseilPdf", () => {
  it("remplit les champs AV", async () => {
    const filled = await fillArbitrageFicheConseilPdf(await makeAvTemplate(), "AV", input);
    const form = (await PDFDocument.load(filled)).getForm();
    expect(form.getTextField("Nomclient").getText()).toBe("DUPONT");
    expect(form.getTextField("Prenomclient").getText()).toBe("Jean");
    expect(form.getTextField("enveloppe").getText()).toBe("AV-123456");
    expect(form.getTextField("Nomconsultant").getText() ?? "").toBe("");
  });

  it("remplit la rédaction arbitrage AV", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const form = doc.getForm();
    form.createTextField("Nomclient");
    form.createTextField("Prenomclient");
    form.createTextField("enveloppe");
    form.createTextField(ARBITRAGE_AV_REDACTION_PDF_FIELDS.motif);
    form.createTextField(ARBITRAGE_AV_REDACTION_PDF_FIELDS.supportsDesinvestis);
    form.createTextField(ARBITRAGE_AV_REDACTION_PDF_FIELDS.supportsInvestis);
    const template = await doc.save();

    const filled = await fillArbitrageFicheConseilPdf(
      template,
      "AV",
      {
        ...input,
        arbitrageRedaction: {
          motif: "Rééquilibrage suite à la hausse des taux.",
          supportsDesinvestis: "UC Monétaire",
          supportsInvestis: "UC Obligataire",
        },
      },
      { templateFamily: "ARBITRAGE" }
    );
    const filledForm = (await PDFDocument.load(filled)).getForm();
    expect(filledForm.getTextField(ARBITRAGE_AV_REDACTION_PDF_FIELDS.motif).getText()).toBe(
      "Rééquilibrage suite à la hausse des taux."
    );
    expect(
      filledForm.getTextField(ARBITRAGE_AV_REDACTION_PDF_FIELDS.supportsDesinvestis).getText()
    ).toBe("UC Monétaire");
    expect(
      filledForm.getTextField(ARBITRAGE_AV_REDACTION_PDF_FIELDS.supportsInvestis).getText()
    ).toBe("UC Obligataire");
  });

  it("remplit le montant VP sur modèle modification AV", async () => {
    const template = await makeAvVpModificationTemplate();
    const filled = await fillArbitrageFicheConseilPdf(
      template,
      "AV",
      { ...input, vpModification: { kinds: ["montant"], montantCentimes: 300_00 } },
      { templateFamily: "VP_MODIFICATION" }
    );
    const form = (await PDFDocument.load(filled)).getForm();
    expect(form.getTextField("Nomclient").getText()).toBe("DUPONT");
    expect(form.getTextField(VP_MODIFICATION_MONTANT_TEXT_FIELD).getText()).toBe("300");
  });

  it("remplit les champs PER", async () => {
    const filled = await fillArbitrageFicheConseilPdf(await makePerTemplate(), "PER", input);
    const form = (await PDFDocument.load(filled)).getForm();
    expect(form.getTextField("invest1").getText()).toBe("DUPONT Jean");
    expect(form.getTextField("numcontrat").getText()).toBe("AV-123456");
    expect(form.getTextField("nomcslt").getText() ?? "").toBe("");
  });

  it("remplit l'opération VP sur modèle modification PER (Text3)", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    form.createTextField("invest1").addToPage(page, { x: 50, y: 200 });
    form.createTextField("numcontrat").addToPage(page, { x: 50, y: 180 });
    form.createTextField(VP_MODIFICATION_PER_OPERATION_TEXT_FIELD).addToPage(page, {
      x: 50,
      y: 50,
      width: 300,
      height: 80,
    });
    const template = await doc.save();

    const filled = await fillArbitrageFicheConseilPdf(
      template,
      "PER",
      { ...input, vpModification: { kinds: ["montant"], montantCentimes: 150_00 } },
      { templateFamily: "VP_MODIFICATION" }
    );
    const filledForm = (await PDFDocument.load(filled)).getForm();
    expect(filledForm.getTextField("invest1").getText()).toBe("DUPONT Jean");
    expect(filledForm.getTextField(VP_MODIFICATION_PER_OPERATION_TEXT_FIELD).getText()).toContain(
      "Montant : 150 €"
    );
  });

  it("remplit mise en place VP sur modèle AV", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    form.createTextField("Nomclient").addToPage(page, { x: 50, y: 200 });
    form.createTextField("Prenomclient").addToPage(page, { x: 50, y: 180 });
    form.createTextField("enveloppe").addToPage(page, { x: 50, y: 160 });
    form.createRadioGroup(VP_MISE_EN_PLACE_OUI_RADIO_FIELD).addOptionToPage("1", page, {
      x: 50,
      y: 100,
    });
    form
      .getRadioGroup(VP_MISE_EN_PLACE_OUI_RADIO_FIELD)
      .addOptionToPage("2", page, { x: 80, y: 100 });
    form.createTextField(VP_MISE_EN_PLACE_MONTANT_TEXT_FIELD).addToPage(page, { x: 50, y: 80 });
    form
      .createDropdown(VP_MISE_EN_PLACE_PERIO_DROPDOWN_FIELD)
      .addOptions(["Mensuel", "Trimestriel", "Semestriel", "Annuel"]);
    form.getDropdown(VP_MISE_EN_PLACE_PERIO_DROPDOWN_FIELD).addToPage(page, { x: 50, y: 60 });
    const template = await doc.save();

    const filled = await fillArbitrageFicheConseilPdf(
      template,
      "AV",
      { ...input, vpMiseEnPlace: { montantCentimes: 100_00, frequence: "MENSUEL" } },
      { templateFamily: "VP_MISE_EN_PLACE" }
    );
    const filledForm = (await PDFDocument.load(filled)).getForm();
    expect(filledForm.getRadioGroup(VP_MISE_EN_PLACE_OUI_RADIO_FIELD).getSelected()).toBe(
      VP_MISE_EN_PLACE_OUI_RADIO_VALUE
    );
    expect(filledForm.getTextField(VP_MISE_EN_PLACE_MONTANT_TEXT_FIELD).getText()).toBe("100");
    expect(filledForm.getDropdown(VP_MISE_EN_PLACE_PERIO_DROPDOWN_FIELD).getSelected()[0]).toBe(
      "Mensuel"
    );
  });

  it("remplit mise en place VP sur modèle PER (Text3)", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    form.createTextField("invest1").addToPage(page, { x: 50, y: 200 });
    form.createTextField("numcontrat").addToPage(page, { x: 50, y: 180 });
    form.createTextField(VP_MISE_EN_PLACE_PER_OPERATION_TEXT_FIELD).addToPage(page, {
      x: 50,
      y: 50,
      width: 300,
      height: 80,
    });
    const template = await doc.save();

    const filled = await fillArbitrageFicheConseilPdf(
      template,
      "PER",
      { ...input, vpMiseEnPlace: { montantCentimes: 200_00, frequence: "MENSUEL" } },
      { templateFamily: "VP_MISE_EN_PLACE" }
    );
    const filledForm = (await PDFDocument.load(filled)).getForm();
    expect(filledForm.getTextField("invest1").getText()).toBe("DUPONT Jean");
    expect(filledForm.getTextField(VP_MISE_EN_PLACE_PER_OPERATION_TEXT_FIELD).getText()).toContain(
      "Mise en place des versements programmés"
    );
    expect(filledForm.getTextField(VP_MISE_EN_PLACE_PER_OPERATION_TEXT_FIELD).getText()).toContain(
      "Montant : 200 €"
    );
  });
});
