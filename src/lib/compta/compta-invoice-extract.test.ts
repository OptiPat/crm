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
