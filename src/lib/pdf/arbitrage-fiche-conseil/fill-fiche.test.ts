import { describe, expect, it } from "vitest";
import { fillArbitrageFicheConseilPdf } from "@/lib/pdf/arbitrage-fiche-conseil/fill-fiche";
import { PDFDocument } from "pdf-lib";

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

  it("remplit les champs PER", async () => {
    const filled = await fillArbitrageFicheConseilPdf(await makePerTemplate(), "PER", input);
    const form = (await PDFDocument.load(filled)).getForm();
    expect(form.getTextField("invest1").getText()).toBe("DUPONT Jean");
    expect(form.getTextField("numcontrat").getText()).toBe("AV-123456");
    expect(form.getTextField("nomcslt").getText() ?? "").toBe("");
  });
});
