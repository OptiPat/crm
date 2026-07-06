import { describe, expect, it } from "vitest";
import { extractComptaDepenseFromText } from "./compta-depense-extract";

const CLEVER_CLOUD = `
Facture F20260601-016655
Date d'émission 2026-06-01
CLIENT EXEMPLE
Sous-total HT 44,00 €
TVA (20 %) 8,80 €
NET À PAYER TTC 52,80 €
Clever Cloud SAS - Nantes
`;

const FORMATION = `
FACTURE N° FAC-029
Date commerciale 08/06/2026
AJI PARTNER
27 rue EXEMPLE
31590 VILLE TEST
CLIENT EXEMPLE
Total HT 1 500,00 €
Taux normal (1 500,00 € à 20%) 300,00 €
Total TTC 1 800,00 €
Accompagnement création, mise en place habilitation CIF
`;

const GITHUB = `
Date 2026-05-29 09:10PM PDT
GitHub Developer Plan - Annual $48.00 USD
Tax $0.00 USD
Total $48.00 USD
GitHub, Inc.
`;

const SONAR = `
Invoice number BGQULAWY0004
Date of issue June 23, 2026
Sonar
Subtotal €90.00
Total €90.00
Amount due €90.00
`;

const ROADSHOW = `
Labège, émis le 01/06/2026
FACTURE n°F/CB/202648106
Organisateur : STELLIUM PLACEMENT
Client : CLIENT EXEMPLE
Roadshow Placement 2026 - Montpellier
Total HT : 37,50 €
Total TVA (20 %) : 7,50 €
Total TTC : 45,00 €
SOMAWEB, éditeur de Linscription.com
`;

const TICKET = `
CEXAMPLE RESTO
SARL EXEMPLE
Justificatif
2 x Repas complet
TOTAL TTC 40,95 €
TVA 10.00% 3,06 €
TVA 5.50% 0,38 €
`;

describe("extractComptaDepenseFromText", () => {
  it("parse Clever Cloud (HT, TVA, TTC)", () => {
    const r = extractComptaDepenseFromText(CLEVER_CLOUD, "clevercloud-invoice-F20260601.pdf");
    expect(r.tiers).toBe("Clever Cloud");
    expect(r.date).toBe("2026-06-01");
    expect(r.ht).toBe(44);
    expect(r.tva).toBe(8.8);
    expect(r.ttc).toBe(52.8);
    expect(r.suggestedCategorie).toBe("Logiciel");
    expect(r.confidence).toBe("high");
  });

  it("parse facture formation CIF", () => {
    const r = extractComptaDepenseFromText(FORMATION, "Facture Audrey PAGES CIF.pdf");
    expect(r.tiers).toBe("AJI PARTNER");
    expect(r.date).toBe("2026-06-08");
    expect(r.ht).toBe(1500);
    expect(r.tva).toBe(300);
    expect(r.ttc).toBe(1800);
    expect(r.suggestedCategorie).toBe("Formation");
  });

  it("parse reçu GitHub USD", () => {
    const r = extractComptaDepenseFromText(GITHUB, "github-OptiPat-receipt-2026-05-29.pdf");
    expect(r.tiers).toBe("GitHub");
    expect(r.date).toBe("2026-05-29");
    expect(r.ttc).toBe(48);
    expect(r.currency).toBe("USD");
    expect(r.suggestedCategorie).toBe("Logiciel");
  });

  it("parse facture Sonar EUR", () => {
    const r = extractComptaDepenseFromText(SONAR, "Sonar.pdf");
    expect(r.tiers).toBe("SonarSource");
    expect(r.date).toBe("2026-06-23");
    expect(r.ttc).toBe(90);
    expect(r.suggestedCategorie).toBe("Logiciel");
  });

  it("parse facture événement Roadshow", () => {
    const r = extractComptaDepenseFromText(ROADSHOW, "Roadshow Placement.pdf");
    expect(r.tiers).toBe("STELLIUM PLACEMENT");
    expect(r.date).toBe("2026-06-01");
    expect(r.ht).toBe(37.5);
    expect(r.tva).toBe(7.5);
    expect(r.ttc).toBe(45);
    expect(r.suggestedCategorie).toBe("Evenement");
  });

  it("parse ticket restaurant multi-TVA", () => {
    const r = extractComptaDepenseFromText(TICKET, "ticket-resto.pdf");
    expect(r.ttc).toBe(40.95);
    expect(r.tva).toBe(3.44);
    expect(r.suggestedCategorie).toBe("Restaurant");
  });

  it("parse facture Cursor USD (reverse charge)", () => {
    const text = `
Invoice number HINLQNS1-0140
Date of issue June 13, 2026
Cursor
2261 Market Street
Bill to CLIENT EXEMPLE
$102.68 USD due June 13, 2026
Subtotal $102.68
Total $102.68
Amount due $102.68 USD
Anysphere, Inc.
Tax to be paid on reverse charge basis
`;
    const r = extractComptaDepenseFromText(text, "Invoice-HINLQNS1-0140.pdf");
    expect(r.tiers).toBe("Cursor");
    expect(r.date).toBe("2026-06-13");
    expect(r.ttc).toBe(102.68);
    expect(r.currency).toBe("USD");
    expect(r.suggestedCategorie).toBe("Logiciel");
  });

  it("parse facture Google Workspace EUR", () => {
    const text = `
Facture Numéro de la facture : GCFRD0013481847
30 juin 2026
12,24 € 2,45 € 14,69 €
Sous-total en EUR TVA (20%) Total en EUR
Google Cloud France SARL
8 Rue de Londres 75009 Paris
Facturé à CLIENT EXEMPLE
Google Workspace Business Standard
`;
    const r = extractComptaDepenseFromText(text, "Google.pdf");
    expect(r.tiers).toBe("Google Workspace");
    expect(r.date).toBe("2026-06-30");
    expect(r.ht).toBe(12.24);
    expect(r.tva).toBe(2.45);
    expect(r.ttc).toBe(14.69);
    expect(r.suggestedCategorie).toBe("Logiciel");
  });

  it("relevé CCP — pas de faux tiers GitHub/Sonar", () => {
    const text = `
RELEVÉ DE COMPTE
La Banque Postale
CCP 1185329 X030
Date valeur libellé débit crédit
07/05/2026 VIREMENT GITHUB INC 48,00
07/05/2026 PRELEVEMENT SONAR SOURCE 90,00
Solde créditeur au 07/05/2026
`;
    const r = extractComptaDepenseFromText(text, "releve_CCP1185329X030_20260507.pdf");
    expect(r.documentKind).toBe("bank_statement");
    expect(r.tiers).toBe("");
    expect(r.ttc).toBe(0);
    expect(r.suggestedCategorie).toBe("Relevé de compte");
    expect(r.date).toBe("2026-05-07");
  });
});
