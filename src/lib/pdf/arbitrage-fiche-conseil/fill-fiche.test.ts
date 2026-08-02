import { describe, expect, it } from "vitest";
import { fillArbitrageFicheConseilPdf } from "@/lib/pdf/arbitrage-fiche-conseil/fill-fiche";
import {
  VP_MODIFICATION_MONTANT_CHECKBOX_FIELD,
  VP_MODIFICATION_MONTANT_TEXT_FIELD,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-pdf-fill";
import { VP_MODIFICATION_PER_OPERATION_TEXT_FIELD } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-per-pdf-fill";
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
});
