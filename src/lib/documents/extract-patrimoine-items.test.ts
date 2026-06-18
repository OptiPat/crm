import { describe, expect, it } from "vitest";
import { parseStelliumRio } from "@/lib/pdf/stellium/rio-parser";
import dupontFixture from "@/lib/pdf/stellium/fixtures/rio-solo-dupont-2026.txt?raw";
import legrandFixture from "@/lib/pdf/stellium/fixtures/rio-solo-legrand-2026.txt?raw";
import rousseauFixture from "@/lib/pdf/stellium/fixtures/rio-couple-rousseau-2026.txt?raw";
import { extractPatrimoineItemsFromRio } from "./extract-patrimoine-items";

describe("extractPatrimoineItemsFromRio", () => {
  it("expose chaque contrat AV/PER avec nom distinct (Dupont)", () => {
    const data = parseStelliumRio(dupontFixture);
    const items = extractPatrimoineItemsFromRio(data);

    const av = items.filter((i) => i.type === "ASSURANCE_VIE");
    expect(av).toHaveLength(1);
    expect(av[0].label).toContain("Cristalliance Evoluvie");
    expect(av[0].montant).toBe(80_000);

    const per = items.find((i) => i.type === "PER");
    expect(per?.label).toContain("PER Individuel");
    expect(per?.montant).toBe(70_000);
  });

  it("pré-remplit crédits immo structurés", () => {
    const data = parseStelliumRio(dupontFixture);
    const rp = extractPatrimoineItemsFromRio(data).find((i) => i.label.includes("Primo MTP"));
    expect(rp?.mensualiteCredit).toBe(1500);
    expect(rp?.creditCRD).toBe(210_000);
    expect(rp?.dateFinCredit).toBe("15/06/2045");
  });

  it("inclut PEA/PEL via contrats financiers (couple Rousseau)", () => {
    const data = parseStelliumRio(rousseauFixture);
    const items = extractPatrimoineItemsFromRio(data);
    const types = new Set(items.map((i) => i.type));
    expect(types.has("PEA")).toBe(true);
    expect(items.filter((i) => i.type === "ASSURANCE_VIE").length).toBeGreaterThan(1);
  });

  it("inclut livrets et comptes courants en épargne bancaire (Legrand solo)", () => {
    const data = parseStelliumRio(legrandFixture);
    const items = extractPatrimoineItemsFromRio(data);
    const cc = items.find((i) => i.type === "EPARGNE_BANCAIRE");
    expect(cc?.montant).toBe(135_000);
    expect(cc?.autoOrigine).toBe("EXISTANT_CLIENT");
  });

  it("inclut chaque livret A distinct (couple Rousseau)", () => {
    const data = parseStelliumRio(rousseauFixture);
    const items = extractPatrimoineItemsFromRio(data);
    const livrets = items.filter((i) => i.type === "LIVRET_A");
    expect(livrets.length).toBeGreaterThanOrEqual(3);
    expect(livrets.every((i) => i.autoOrigine === "EXISTANT_CLIENT")).toBe(true);
    const comptes = items.filter((i) => i.type === "EPARGNE_BANCAIRE");
    expect(comptes.length).toBeGreaterThanOrEqual(2);
  });

  it("fallback résidence secondaire et actions/obligations sans biens détaillés", () => {
    const items = extractPatrimoineItemsFromRio({
      residenceSecondaire: { valeur: 200_000 },
      actionsObligations: 50_000,
    });
    expect(items.find((i) => i.type === "RS")?.montant).toBe(200_000);
    expect(items.find((i) => i.label === "Actions / Obligations")?.montant).toBe(50_000);
  });
});
