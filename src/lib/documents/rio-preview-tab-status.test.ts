import { describe, expect, it } from "vitest";
import type { ExtractedData } from "@/lib/pdf";
import {
  assessRioPreviewTabStatus,
  computePatrimoineLinesSum,
  missingFieldToTab,
  patrimoineCoherenceGap,
} from "./rio-preview-tab-status";

const baseRio: ExtractedData = {
  typeDocument: "RIO",
  nom: "DUPONT",
  prenom: "Jean",
  revenusTotal: 80_000,
  patrimoineTotal: 500_000,
  biensImmobiliers: [
    {
      id: "1",
      nom: "RP",
      type: "RESIDENCE_PRINCIPALE",
      valeur: 300_000,
    },
  ],
  contratsFinanciers: [
    {
      id: "c1",
      nom: "Generali",
      type: "ASSURANCE_VIE",
      montant: 200_000,
    },
  ],
};

describe("rio-preview-tab-status", () => {
  it("mappe les champs manquants vers les onglets", () => {
    expect(missingFieldToTab("nom")).toBe("contact");
    expect(missingFieldToTab("revenus")).toBe("revenus");
    expect(missingFieldToTab("patrimoine")).toBe("patrimoine");
  });

  it("signale un onglet contact incomplet", () => {
    expect(
      assessRioPreviewTabStatus(baseRio, "contact", ["nom"])
    ).toBe("warn");
    expect(assessRioPreviewTabStatus(baseRio, "contact", [])).toBe("ok");
  });

  it("calcule la somme des lignes patrimoine", () => {
    expect(computePatrimoineLinesSum(baseRio)).toBe(500_000);
  });

  it("détecte un écart de cohérence patrimoine", () => {
    const incoherent: ExtractedData = {
      ...baseRio,
      patrimoineTotal: 800_000,
    };
    expect(patrimoineCoherenceGap(incoherent)).toBe(300_000);
    expect(patrimoineCoherenceGap(baseRio)).toBeNull();
  });
});
