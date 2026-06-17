import { describe, expect, it } from "vitest";
import { parseStelliumFiscalite } from "./fiscalite";
import rousseauFixture from "./fixtures/rio-couple-rousseau-2026.txt?raw";
import legrandFixture from "./fixtures/rio-solo-legrand-2026.txt?raw";
import durandMoreauFixture from "./fixtures/rio-couple-durand-moreau-2026.txt?raw";
import { getSection, splitStelliumSections } from "./sections";

describe("stellium fiscalite", () => {
  it("extrait TMI et revenu brut global du couple ROUSSEAU", () => {
    const sections = splitStelliumSections(rousseauFixture);
    const fiscalite = getSection(sections, "fiscalite");
    expect(fiscalite).toBeTruthy();

    const parsed = parseStelliumFiscalite(fiscalite);
    expect(parsed.trancheImposition).toBe("11%");
    expect(parsed.revenuBrutGlobal).toBe(63264 + 63264);
  });

  it("extrait le revenu brut global solo Legrand (sans TMI dans le PDF)", () => {
    const sections = splitStelliumSections(legrandFixture);
    const fiscalite = getSection(sections, "fiscalite");
    expect(fiscalite).toBeTruthy();

    const parsed = parseStelliumFiscalite(fiscalite);
    expect(parsed.trancheImposition).toBeUndefined();
    expect(parsed.revenuBrutGlobal).toBe(72_026);
  });

  it("agrège les revenus bruts globaux du couple DURAND/MOREAU", () => {
    const sections = splitStelliumSections(durandMoreauFixture);
    const fiscalite = getSection(sections, "fiscalite");
    expect(fiscalite).toBeTruthy();

    const parsed = parseStelliumFiscalite(fiscalite);
    expect(parsed.revenuBrutGlobal).toBe(37_289 + 34_958);
  });
});
