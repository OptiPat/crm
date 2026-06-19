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
    expect(parsed.irNetAPayer).toBe(3145 + 3145);
  });

  it("extrait le revenu brut global solo Legrand (sans TMI dans le PDF)", () => {
    const sections = splitStelliumSections(legrandFixture);
    const fiscalite = getSection(sections, "fiscalite");
    expect(fiscalite).toBeTruthy();

    const parsed = parseStelliumFiscalite(fiscalite);
    expect(parsed.trancheImposition).toBeUndefined();
    expect(parsed.revenuBrutGlobal).toBe(72_026);
    expect(parsed.irNetAPayer).toBe(12_000);
  });

  it("extrait le revenu brut global malgré un pied de page entre la valeur et le mot d'arrêt", () => {
    const section = [
      "Impôt sur le revenu (IR)\tJean DUPONT",
      "IR acquitté en\t2025",
      "Total des salaires et assimilés\t28021 €",
      "Revenu brut global\t25219 €",
      "Recueil d'informations - Jean DUPONT et - 18/06/2026\t4/6",
      "",
      "Le foyer fiscal est-il soumis à l'impôt sur le revenu (IR) ?\tOui",
      "Impôt sur les revenus soumis au barème\t-",
      "IR net à payer\t1450 €",
      "Taux Marginal d'Imposition (TMI)\t11 %",
      "Nombre de parts fiscales\t2.50",
    ].join("\n");

    const parsed = parseStelliumFiscalite(section);
    expect(parsed.revenuBrutGlobal).toBe(25_219);
    expect(parsed.irNetAPayer).toBe(1_450);
    expect(parsed.trancheImposition).toBe("11%");
    expect(parsed.nombrePartsFiscales).toBe(2.5);
  });

  it("agrège les revenus bruts globaux du couple DURAND/MOREAU", () => {
    const sections = splitStelliumSections(durandMoreauFixture);
    const fiscalite = getSection(sections, "fiscalite");
    expect(fiscalite).toBeTruthy();

    const parsed = parseStelliumFiscalite(fiscalite);
    expect(parsed.revenuBrutGlobal).toBe(37_289 + 34_958);
    expect(parsed.irNetAPayer).toBe(4_349 + 3_811);
  });
});
