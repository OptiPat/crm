import { describe, expect, it } from "vitest";
import { parseCoupleIdentite } from "./rio-couple";

describe("parseCoupleIdentite — colonnes tabulées", () => {
  it("sépare les valeurs sur tabulations comme sur double espaces", () => {
    const identite = [
      "Civilité\tMadame\tMonsieur",
      "Nom d'usage / prénom\tDURAND Claire\tMOREAU Guillaume",
      "Nom de naissance\tDURAND\tMOREAU",
      "Né(e) le\t14/05/1995 à Paris - France\t12/07/1996 à Brest - France",
    ].join("\n");

    const { person1, person2 } = parseCoupleIdentite(identite, "", "");

    expect(person1.civilite).toBe("MME");
    expect(person1.nom).toBe("DURAND");
    expect(person1.prenom).toBe("Claire");
    expect(person2.civilite).toBe("M");
    expect(person2.nom).toBe("MOREAU");
    expect(person2.prenom).toBe("Guillaume");
  });
});
