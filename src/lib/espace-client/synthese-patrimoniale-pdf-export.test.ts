import { describe, expect, it } from "vitest";
import {
  buildSynthesePatrimonialePdfBytes,
  canSharePdfFile,
  isShareCancellation,
  synthesePdfDownloadFilename,
  synthesePdfOpensPreview,
} from "./synthese-patrimoniale-pdf-export";
import type { SynthesePdfModel } from "./synthese-patrimoniale-pdf";

function model(partial: Partial<SynthesePdfModel> = {}): SynthesePdfModel {
  return {
    clientName: "Jean DUPONT",
    clientNom: "DUPONT",
    clientPrenom: "Jean",
    subtitle: "Synthèse patrimoniale",
    generatedLabel: "15 août 2026",
    totalCentimes: 20_000_00,
    charts: [
      {
        title: "Par catégorie",
        totalCentimes: 20_000_00,
        slices: [
          {
            name: "Épargne bancaire",
            color: "#888888",
            percent: 100,
            valueCentimes: 20_000_00,
          },
        ],
      },
    ],
    groups: [
      {
        category: "Épargne bancaire",
        items: [
          {
            id: 1,
            title: "Livret A",
            subtitle: null,
            amountCentimes: 20_000_00,
            originDateLabel: "Souscrit le 24 janv. 2026",
            encoursDateLabel: "Au 24 janv. 2026",
            valorisations: [
              {
                dateLabel: "24 janv. 2026",
                montantCentimes: 20_000_00,
                kind: "souscription",
              },
            ],
          },
        ],
      },
    ],
    legalLines: ["Jean DUPONT", "0612345678", "Cabinet Exemple"],
    ...partial,
  };
}

describe("synthese-patrimoniale-pdf-export", () => {
  it("ouvre un aperçu sur téléphone, pas sur ordi", () => {
    expect(
      synthesePdfOpensPreview({
        framed: true,
        viewport: "mobile",
        viewportWidthPx: 1400,
      })
    ).toBe(true);
    expect(
      synthesePdfOpensPreview({
        framed: true,
        viewport: "desktop",
        viewportWidthPx: 1400,
      })
    ).toBe(false);
    expect(
      synthesePdfOpensPreview({
        framed: false,
        viewportWidthPx: 390,
      })
    ).toBe(true);
    expect(
      synthesePdfOpensPreview({
        framed: false,
        viewportWidthPx: 1280,
      })
    ).toBe(false);
  });
  it("produit un fichier PDF, pas une page HTML", async () => {
    const bytes = await buildSynthesePatrimonialePdfBytes(model());
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    expect(head).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(800);
  });

  it("reste valide sans graphique ni logo", async () => {
    const bytes = await buildSynthesePatrimonialePdfBytes(
      model({ charts: [], logoUrl: null, totalCentimes: 0 })
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("annulation du partage et absence de Web Share", () => {
    expect(isShareCancellation({ name: "AbortError" })).toBe(true);
    expect(isShareCancellation({ name: "NotAllowedError" })).toBe(false);
    const file = new File([new Uint8Array([37, 80, 68, 70])], "x.pdf", {
      type: "application/pdf",
    });
    expect(canSharePdfFile(file)).toBe(false);
  });

  it("nomme le téléchargement, pas le partage", () => {
    expect(synthesePdfDownloadFilename(model())).toBe(
      "Synthèse patrimoniale - DUPONT Jean - 15 août 2026.pdf"
    );
  });
});
