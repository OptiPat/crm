import { describe, expect, it } from "vitest";
import { extractComptaInvoiceFromText } from "./compta-invoice-extract";

/** Structure FinzzAct anonymisée (alignée sur factures modèles). */
const FINZZACT_FIXTURE = `
Facture n° 241
Date de facture : 15/03/2026

Adresse de facturation :
SOCIETE EXEMPLE SARL

TOTAL EXONERE * : 1200.00 €
TOTAL HT : 11.75 €
TOTAL TVA : 2.35 €
TOTAL TTC : 14.10 €

Débours pour paiement pour mon compte (Programme FinzzAct) :
Don à un organisme d'intérêt général
Article 200, 238 bis et 978 du code général des impôts (CGI)

-
12.00
€
`;

describe("extractComptaInvoiceFromText", () => {
  it("parse une facture FinzzAct (client, totaux, don)", () => {
    const result = extractComptaInvoiceFromText(FINZZACT_FIXTURE, "241.pdf");

    expect(result.client).toBe("SOCIETE EXEMPLE SARL");
    expect(result.exonere).toBe(1200);
    expect(result.ht).toBe(11.75);
    expect(result.tva).toBe(2.35);
    expect(result.don).toBe(12);
    expect(result.ttc).toBe(14.1);
    expect(result.total).toBe(1202.1);
    expect(result.date).toBe("2026-03-15");
    expect(result.confidence).toBe("high");
  });

  it("extrait le client depuis Adresse de facturation", () => {
    const text =
      "Adresse de facturation :\nCLIENT TEST\nTOTAL EXONERE * : 100,00 €\nTOTAL HT : 100,00 €";
    expect(extractComptaInvoiceFromText(text, "x.pdf").client).toBe("CLIENT TEST");
  });

  it("ignore le total reçu (3940,54) et prend le don sous le tiret (244)", () => {
    const text = `
Adresse de facturation :
SOCIETE EXEMPLE SAS

TOTAL EXONERE * : 3780.04 €
TOTAL HT : 168.75 €
TOTAL TVA : 33.75 €
TOTAL TTC : 202.50 €

Débours pour paiement pour mon compte (Programme FinzzAct) :
Don à un organisme d'intérêt général
Article 200, 238 bis et 978 du code général des impôts (CGI)

3940.54 €

-
42.00
€

TOTAL REGLE PAR STELLIUM 3940.54 €
`;
    const result = extractComptaInvoiceFromText(text, "244.pdf");
    expect(result.exonere).toBe(3780.04);
    expect(result.ht).toBe(168.75);
    expect(result.tva).toBe(33.75);
    expect(result.don).toBe(42);
    expect(result.ttc).toBe(202.5);
    expect(result.total).toBe(3940.54);
  });

  it("parse don inline « - 42.00 € » (layout pdf.js)", () => {
    const text = `
TOTAL HT : 168.75 €
TOTAL TVA : 33.75 €
TOTAL EXONERE * : 3780.04 €
Programme FinzzAct
Don à un organisme d'intérêt général
Article 200 du code général des impôts (CGI)
- 42.00 €
TOTAL REGLE PAR PARTENAIRE 3940.54 €
`;
    const result = extractComptaInvoiceFromText(text, "244.pdf");
    expect(result.don).toBe(42);
    expect(result.total).toBe(3940.54);
  });

  it("parse facture classique HT + TVA % + TTC", () => {
    const text = `
FACTURE - 67
Date de facturation: 01/06/2026
PLAZA SOCIETE CLIENT SARL
Description Prix
Prestation 02/12/2025 218,40 €
Total HT 182,00 €
TVA 20,00 % 36,40 €
Total TTC 218,40 €
`;
    const result = extractComptaInvoiceFromText(text, "FACTURE 67.pdf");
    expect(result.client).toBe("SOCIETE CLIENT SARL");
    expect(result.date).toBe("2026-06-01");
    expect(result.ht).toBe(182);
    expect(result.tva).toBe(36.4);
    expect(result.ttc).toBe(218.4);
    expect(result.total).toBe(218.4);
    expect(result.exonere).toBe(0);
    expect(result.don).toBe(0);
  });

  it("parse facture TTC seul (EI émetteur + EI client)", () => {
    const text = `
Facture
A Ville Exemple, le 17/06/2026
EI EMETTEUR EXEMPLE
SIRET 00000000000000
EI CLIENT EXEMPLE
SIRET 11111111111111
DESCRIPTION DATE MONTANT TTC
Pack CIF 17/06/2026 € 450
`;
    const result = extractComptaInvoiceFromText(text, "CLIENT EXEMPLE Facture.pdf");
    expect(result.client).toBe("EI CLIENT EXEMPLE");
    expect(result.date).toBe("2026-06-17");
    expect(result.ht).toBe(450);
    expect(result.tva).toBe(0);
    expect(result.ttc).toBe(450);
    expect(result.total).toBe(450);
  });

  it("parse facture TTC — client sans EI (Reboux)", () => {
    const text = `
Facture
A Ville Exemple, le 17/06/2026
EI EMETTEUR EXEMPLE
SIRET 00000000000000
4 IMPASSE DES ACACIAS
34000 EXEMPLE VILLE
CLIENT EXEMPLE REBOUX
SIREN 917 587 073
5 RUE EXEMPLE, 30700 UZES
DESCRIPTION DATE MONTANT TTC
Pack CIF 17/06/2026 € 450
`;
    const result = extractComptaInvoiceFromText(text, "Reboux Facture.pdf");
    expect(result.client).toBe("CLIENT EXEMPLE REBOUX");
    expect(result.ht).toBe(450);
    expect(result.ttc).toBe(450);
  });
});

/** Formats rencontrés en 2026 — données fictives (dépôt public). */
describe("extractComptaInvoiceFromText — formats 2026", () => {
  it("facture de commission : Montant / Base de TVA / Montant TVA + don", () => {
    const text = `Programme FinzzAct
FACTURE N° 999 du 23-07-2026
Commission immobilière TVA 20%\t1000,00
TVA : 20,00\tEUR
Montant\t1000,00\t1000,00
Base de TVA\t1000,00\t1000,00
Montant TVA\t200,00\t200,00
Total TTC\t1200,00\t1200,00
Don à un organisme d'intérêt général
Article 200, 238 bis et 978 du code général des impôts (CGI)\t- 10,00
TOTAL REGLE PAR STELLIUM 1190,00`;
    const r = extractComptaInvoiceFromText(text, "Facture 999 - DUPONT Jean.pdf");
    expect(r.ht).toBe(1000);
    expect(r.tva).toBe(200);
    expect(r.don).toBe(10);
    expect(r.total).toBe(1190);
  });

  it("relevé partenaire : montants sans centimes (exonéré, HT, TVA, don)", () => {
    const text = `Programme FinzzAct
* Les commissions de ventes sont exonérées de TVA, article 261C du Code Général des Impôts
TOTAL EXONERE * : 1050 €
TOTAL HT : 132.5 €
TOTAL TVA : 26.5 €
TOTAL TTC : 159 €
Don à un organisme d'intérêt général
- 13 €
TOTAL REGLE PAR STELLIUM 1196 €`;
    const r = extractComptaInvoiceFromText(text, "Commissions - LEGRAND Paul.pdf");
    expect(r.exonere).toBe(1050);
    expect(r.ht).toBe(132.5);
    expect(r.tva).toBe(26.5);
    expect(r.don).toBe(13);
    expect(r.total).toBe(1196);
  });

  it("relevé partenaire sans récapitulatif : ligne TOTAL HT/TVA/TTC", () => {
    const text = `Programme FinzzAct
Comm\tTVA\tComm
HT €\t20%\tTTC €
28/09/2026\t10€\t2€\t12€
TOTAL 178.3€ 35.66€ 213.96€
* Les commissions de ventes sont exonérées de TVA, article 261C du Code Général des Impôts
TOTAL EXONERE * : €`;
    const r = extractComptaInvoiceFromText(text, "Commissions - BERNARD Luc.pdf");
    expect(r.ht).toBe(178.3);
    expect(r.tva).toBe(35.66);
    expect(r.exonere).toBe(0);
  });
});
