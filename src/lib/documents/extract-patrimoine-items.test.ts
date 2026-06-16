import { describe, expect, it } from "vitest";
import { parseStelliumRio } from "@/lib/pdf/stellium/rio-parser";
import plazaFixture from "@/lib/pdf/stellium/fixtures/rio-plaza-2026.txt?raw";
import debbaghiFixture from "@/lib/pdf/stellium/fixtures/rio-debbaghi-couple-2026.txt?raw";
import { extractPatrimoineItemsFromRio } from "./extract-patrimoine-items";

describe("extractPatrimoineItemsFromRio", () => {
  it("expose chaque contrat AV/PER avec nom distinct (Plaza)", () => {
    const data = parseStelliumRio(plazaFixture);
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
    const data = parseStelliumRio(plazaFixture);
    const rp = extractPatrimoineItemsFromRio(data).find((i) => i.label.includes("Primo MTP"));
    expect(rp?.mensualiteCredit).toBe(1500);
    expect(rp?.creditCRD).toBe(210_000);
    expect(rp?.dateFinCredit).toBe("15/06/2045");
  });

  it("inclut PEA/PEL via contrats financiers (Debbaghi)", () => {
    const data = parseStelliumRio(debbaghiFixture);
    const items = extractPatrimoineItemsFromRio(data);
    const types = new Set(items.map((i) => i.type));
    expect(types.has("PEA")).toBe(true);
    expect(items.filter((i) => i.type === "ASSURANCE_VIE").length).toBeGreaterThan(1);
  });
});
