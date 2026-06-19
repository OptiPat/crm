import { describe, expect, it } from "vitest";
import { parseStelliumRio } from "./rio-parser";
import { splitStelliumSections } from "./sections";
import pagebreakFixture from "./fixtures/rio-solo-pagebreak-2026.txt?raw";

describe("RIO solo — saut de page Patrimoine/Actifs + crédits reportés", () => {
  const data = parseStelliumRio(pagebreakFixture);

  it("détecte la section patrimoine malgré un pied de page entre « Patrimoine » et « Actifs »", () => {
    // Bug 1 : sans tolérance au footer, la section (et donc tout le patrimoine)
    // était perdue.
    const sections = splitStelliumSections(pagebreakFixture);
    expect(sections.patrimoine).toBeTruthy();
    expect(sections.patrimoine).toContain("Résidence principale");

    expect(data.residencePrincipale?.valeur).toBe(300000);
    expect(data.biensImmobiliers?.length).toBe(2);
    expect(data.patrimoineTotal).toBe(600000);
  });

  it("rattache le CRD au bien même quand la désignation est reportée après les montants", () => {
    // Bug 2 : « Crédit immobilier - Amortissable - » puis montants puis nom du
    // bien sur des lignes PDF séparées.
    const rp = data.biensImmobiliers?.find((b) => b.nom === "Maison");
    const loc = data.biensImmobiliers?.find((b) => b.nom === "Studio");

    expect(rp).toMatchObject({
      type: "RESIDENCE_PRINCIPALE",
      valeur: 300000,
      echeanceAnnuelle: 12000,
      creditCRD: 250000,
      mensualiteCredit: 1000,
      dateFinCredit: "10/10/2045",
    });
    expect(loc).toMatchObject({
      type: "LOCATIF",
      valeur: 200000,
      echeanceAnnuelle: 6000,
      creditCRD: 150000,
      mensualiteCredit: 500,
      dateFinCredit: "20/02/2046",
    });
  });

  it("classe « Livret classique » en épargne et non en immobilier", () => {
    // Bug « épargne rangée en immobilier ».
    const livret = data.contratsFinanciers?.find((c) => c.nom === "Tresor");
    expect(livret).toMatchObject({ type: "LIVRET_A", montant: 20000 });
    expect(data.livretA).toBe(20000);

    expect(data.biensImmobiliers?.some((b) => b.nom === "Tresor")).toBe(false);
    // Seul le vrai locatif « Studio » compte dans l'immobilier locatif.
    expect(data.immobilierLocatif?.valeur).toBe(200000);
  });
});
