import { describe, expect, it } from "vitest";
import { parseStelliumRio } from "./rio-parser";
import plazaNicolas from "./fixtures/rio-plaza-nicolas-2026.txt?raw";
import {
  enrichBiensImmobiliersWithCredits,
  parseStelliumPassifsMortgageCredits,
} from "./immo-credits";
import type { BienImmobilier } from "../types";

describe("immo-credits — Plaza Nicolas 2026 (PDF réel)", () => {
  it("parse les crédits avec bien dans la désignation Passifs", () => {
    const credits = parseStelliumPassifsMortgageCredits(plazaNicolas);
    expect(credits).toHaveLength(2);
    expect(credits.find((c) => c.propertyName.includes("Primo"))).toMatchObject({
      crd: 166183,
      echeanceAnnuelle: 9454,
      dateFinCredit: "10/11/2046",
    });
    expect(credits.find((c) => c.productType.toLowerCase().includes("pinel"))).toMatchObject({
      propertyName: "sète",
      crd: 141267,
      echeanceAnnuelle: 8306,
      dateFinCredit: "24/12/2046",
    });
  });

  it("parse les crédits en colonnes tabulées (pdfjs)", () => {
    const tabbed = `Passifs
Crédit immobilier - Amortissable - Primo MTP\tNicolas PLAZA\t9 454 €\t166 183 €\t10/11/2046
Crédit immobilier - Amortissable - Pinel sète\tNicolas PLAZA\t8 306 €\t141 267 €\t24/12/2046
Revenus et charges`;

    const credits = parseStelliumPassifsMortgageCredits(tabbed);
    expect(credits.find((c) => c.propertyName.includes("Primo"))?.crd).toBe(166183);
    expect(credits.find((c) => c.productType.toLowerCase().includes("pinel"))?.crd).toBe(141267);
  });

  it("parse Primo MTP quand la désignation est coupée après Amortissable (pdfjs)", () => {
    const tabbed = `Passifs
Crédit immobilier - Amortissable -\tPrimo MTP\tNicolas PLAZA\t9 454 €\t166 183 €\t10/11/2046
Crédit immobilier - Amortissable - Pinel\tsète\tNicolas PLAZA\t8 306 €\t141 267 €\t24/12/2046
Revenus et charges`;

    const credits = parseStelliumPassifsMortgageCredits(tabbed);
    expect(credits.find((c) => c.propertyName.includes("Primo"))).toMatchObject({
      crd: 166183,
      echeanceAnnuelle: 9454,
      dateFinCredit: "10/11/2046",
    });
    expect(credits.find((c) => c.productType.toLowerCase().includes("pinel"))?.crd).toBe(141267);
  });

  it("fusionne les lignes Passifs coupées comme le PDF Plaza 16/06/2026", () => {
    const multiline = `Passifs
Crédit immobilier - Amortissable -
Primo MTP Nicolas PLAZA 9 454 € 166 183 € 10/11/2046
Crédit immobilier - Amortissable - Pinel
sète Nicolas PLAZA 8 306 € 141 267 € 24/12/2046
Revenus et charges`;

    const credits = parseStelliumPassifsMortgageCredits(multiline);
    expect(credits.find((c) => c.propertyName.includes("Primo"))?.crd).toBe(166183);
    expect(credits.find((c) => c.productType.toLowerCase().includes("pinel"))?.crd).toBe(141267);
  });

  it("fusionne les lignes Passifs coupées (pdfjs multiligne)", () => {
    const multiline = `Passifs
Crédit immobilier - Amortissable - Primo MTP
Nicolas PLAZA
9 454 €
166 183 €
10/11/2046
Crédit immobilier - Amortissable - Pinel sète
Nicolas PLAZA
8 306 €
141 267 €
24/12/2046
Revenus et charges`;

    const credits = parseStelliumPassifsMortgageCredits(multiline);
    expect(credits).toHaveLength(2);
    expect(credits[0]?.crd).toBe(166183);
    expect(credits[1]?.crd).toBe(141267);
  });

  it("associe chaque crédit au bon bien immobilier", () => {
    const data = parseStelliumRio(plazaNicolas);
    const rp = data.biensImmobiliers?.find((b) => b.nom === "Primo MTP");
    const airbnb = data.biensImmobiliers?.find((b) => b.nom === "Sete AIRBNB");
    const pinel = data.biensImmobiliers?.find((b) => b.nom === "Sète");

    expect(rp).toMatchObject({
      valeur: 340000,
      creditCRD: 166183,
      mensualiteCredit: 788,
      dateFinCredit: "10/11/2046",
    });
    expect(airbnb).toMatchObject({ valeur: 72500, loyersAnnuels: 10500 });
    expect(airbnb?.creditCRD).toBeUndefined();
    expect(pinel).toMatchObject({
      valeur: 180000,
      creditCRD: 141267,
      mensualiteCredit: 692,
      dateFinCredit: "24/12/2046",
      loyersAnnuels: 6180,
    });
  });

  it("n'écrase pas la RP avec le crédit Pinel", () => {
    const biens: BienImmobilier[] = [
      { id: "rp", type: "RESIDENCE_PRINCIPALE", nom: "Primo MTP", valeur: 340000 },
      { id: "pinel", type: "PINEL", nom: "Sète", valeur: 180000 },
    ];
    enrichBiensImmobiliersWithCredits(plazaNicolas, biens);
    expect(biens[0]).toMatchObject({
      creditCRD: 166183,
      mensualiteCredit: 788,
      dateFinCredit: "10/11/2046",
    });
    expect(biens[1]).toMatchObject({
      creditCRD: 141267,
      mensualiteCredit: 692,
      dateFinCredit: "24/12/2046",
    });
  });
});
