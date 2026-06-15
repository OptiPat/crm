import { describe, expect, it } from "vitest";
import {
  attachRioPatrimoineOwner,
  buildRioPatrimoineOwner,
  isFoyerPatrimoineRio,
} from "./rio-patrimoine-target";

describe("rio-patrimoine-target", () => {
  it("détecte le patrimoine foyer pour un RIO couple", () => {
    expect(isFoyerPatrimoineRio({ isCouple: true, foyerId: 12 })).toBe(true);
    expect(isFoyerPatrimoineRio({ isCouple: true })).toBe(false);
    expect(isFoyerPatrimoineRio({ foyerId: 12 })).toBe(false);
  });

  it("cible le foyer quand useFoyer est actif", () => {
    expect(buildRioPatrimoineOwner({ contactId: 1, foyerId: 9, useFoyer: true })).toEqual({
      foyer_id: 9,
    });
    expect(buildRioPatrimoineOwner({ contactId: 1, foyerId: 9, useFoyer: false })).toEqual({
      contact_id: 1,
    });
  });

  it("attache le propriétaire à un investissement", () => {
    const inv = attachRioPatrimoineOwner(
      {
        type_produit: "IMMOBILIER",
        nom_produit: "RP",
        montant_initial: 100_000_00,
        origine: "EXISTANT_CLIENT",
      },
      { foyer_id: 3 }
    );
    expect(inv.foyer_id).toBe(3);
    expect(inv.contact_id).toBeUndefined();
  });
});
