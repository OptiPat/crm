import { describe, expect, it } from "vitest";
import { parseStelliumRio } from "./rio-parser";
import type { BienImmobilier } from "../types";
import {
  enrichBiensImmobiliersWithCredits,
  parseStelliumPassifsMortgageCredits,
} from "./immo-credits";

/** Passifs + actifs minimaux — extrait du PDF Dupont 16/06/2026. */
const REAL_PDF_PASSIFS = `Patrimoine Actifs
Résidence principale - Primo MTP 340 000 €
LMNP Classique - Sete AIRBNB 72 500 €
Pinel - Sète 180 000 €
Passifs
Désignation Emprunteur Echéance par an CRD Date d'échéance
Crédits immobilier 24 045 € 410 881 €
Crédit immobilier - Amortissable -
Primo MTP Jean DUPONT 9 454 € 166 183 € 10/11/2046
Crédit immobilier - Amortissable - Pinel
sète Jean DUPONT 8 306 € 141 267 € 24/12/2046
Crédit immobilier - Amortissable -
Crédits immobilier - LMNP AIRBNB Jean DUPONT 6 285 € 103 431 € 18/02/2046
TOTAL 24 045 € 410 881 €
Revenus et charges
Revenu foncier ou BIC - Sete AIRBNB 10 500 €
Revenu foncier ou BIC - Sète 6 180 €
Charges
Mensualité de crédit - Primo MTP 9 454 € 9 454 €
Mensualité de crédit - Pinel sète 8 306 € 8 306 €`;

describe("immo-credits — PDF Dupont 16/06/2026 (passifs réels)", () => {
  it("parse et associe le crédit Primo MTP", () => {
    const credits = parseStelliumPassifsMortgageCredits(REAL_PDF_PASSIFS);
    const primoCredit = credits.find(
      (c) =>
        c.propertyName.toLowerCase().includes("primo") ||
        c.designation.toLowerCase().includes("primo")
    );
    expect(primoCredit).toMatchObject({
      crd: 166183,
      echeanceAnnuelle: 9454,
      dateFinCredit: "10/11/2046",
    });

    const data = parseStelliumRio(
      `Recueil d'informations Consultant : Jean DUPONT Investisseur : Jean DUPONT ${REAL_PDF_PASSIFS}`
    );
    const rp = data.biensImmobiliers?.find((b) => b.nom === "Primo MTP");
    expect(rp?.creditCRD).toBe(166183);
    expect(rp?.mensualiteCredit).toBe(788);
    expect(rp?.dateFinCredit).toBe("10/11/2046");
  });

  it("secours via Mensualité de crédit si Passifs illisible", () => {
    const brokenPassifs = `Patrimoine Actifs
Résidence principale - Primo MTP 340 000 €
Pinel - Sète 180 000 €
Passifs
Crédit immobilier - Amortissable -
Revenus et charges
Mensualité de crédit - Primo MTP 9 454 € 9 454 €
Mensualité de crédit - Pinel sète 8 306 € 8 306 €`;

    const biens: BienImmobilier[] = [
      { id: "rp", type: "RESIDENCE_PRINCIPALE", nom: "Primo MTP", valeur: 340000 },
      { id: "pinel", type: "PINEL", nom: "Sète", valeur: 180000 },
    ];
    enrichBiensImmobiliersWithCredits(brokenPassifs, biens);
    expect(biens[0].mensualiteCredit).toBe(788);
    expect(biens[1].mensualiteCredit).toBe(692);
  });
});
