import { describe, expect, it } from "vitest";
import { parseStelliumFiscalite } from "./fiscalite";
import debbaghiFixture from "./fixtures/rio-debbaghi-couple-2026.txt?raw";
import martinezFixture from "./fixtures/rio-martinez-2026.txt?raw";
import noyezFixture from "./fixtures/rio-noyez-gentil-couple-2026.txt?raw";
import { getSection, splitStelliumSections } from "./sections";

describe("stellium fiscalite", () => {
  it("extrait TMI et revenu brut global du couple DEBBAGHI", () => {
    const sections = splitStelliumSections(debbaghiFixture);
    const fiscalite = getSection(sections, "fiscalite");
    expect(fiscalite).toBeTruthy();

    const parsed = parseStelliumFiscalite(fiscalite);
    expect(parsed.trancheImposition).toBe("11%");
    expect(parsed.revenuBrutGlobal).toBe(63264 + 63264);
  });

  it("extrait le revenu brut global solo Martinez (sans TMI dans le PDF)", () => {
    const sections = splitStelliumSections(martinezFixture);
    const fiscalite = getSection(sections, "fiscalite");
    expect(fiscalite).toBeTruthy();

    const parsed = parseStelliumFiscalite(fiscalite);
    expect(parsed.trancheImposition).toBeUndefined();
    expect(parsed.revenuBrutGlobal).toBe(72_026);
  });

  it("agrège les revenus bruts globaux du couple NOYEZ/GENTIL", () => {
    const sections = splitStelliumSections(noyezFixture);
    const fiscalite = getSection(sections, "fiscalite");
    expect(fiscalite).toBeTruthy();

    const parsed = parseStelliumFiscalite(fiscalite);
    expect(parsed.revenuBrutGlobal).toBe(37_289 + 34_958);
  });
});
