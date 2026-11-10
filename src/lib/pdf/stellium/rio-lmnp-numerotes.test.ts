import { describe, expect, it } from "vitest";
import { parseStelliumRio } from "./rio-parser";
import fixture from "./fixtures/rio-solo-lmnp-numerotes-2026.txt?raw";

describe("RIO solo — biens homonymes numérotés (« LMNP 1/2/3 »)", () => {
  const data = parseStelliumRio(fixture);
  const byNom = (nom: string) => data.biensImmobiliers?.find((b) => b.nom === nom);

  it("garde le numéro dans le nom au lieu de le coller au montant", () => {
    // Bug : « LMNP 1\t140000 € » lu comme « LMNP » + 1 140 000 €.
    expect(data.biensImmobiliers?.map((b) => [b.nom, b.valeur])).toEqual([
      ["LMNP 1", 140000],
      ["LMNP 2", 120000],
      ["LMNP 3", 87500],
    ]);
    expect(data.immobilierLocatif?.valeur).toBe(347500);
  });

  it("rattache chaque crédit et loyer au bon numéro", () => {
    expect(byNom("LMNP 1")).toMatchObject({ creditCRD: 112193, echeanceAnnuelle: 7859, loyersAnnuels: 8400 });
    expect(byNom("LMNP 2")).toMatchObject({ creditCRD: 125709, echeanceAnnuelle: 7753, loyersAnnuels: 7320 });
    const lmnp3 = byNom("LMNP 3");
    expect(lmnp3?.loyersAnnuels).toBe(7200);
    expect(lmnp3?.creditCRD).toBeUndefined();
    expect(lmnp3?.echeanceAnnuelle).toBeUndefined();
  });

  it("compte les lignes « Autre épargne » dans l'épargne totale", () => {
    // Avant : CSL et Parts sociales absents du total (liste fixe de types).
    expect(data.epargneTotal).toBe(215883);
  });
});
