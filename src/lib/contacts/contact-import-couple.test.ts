import { describe, expect, it } from "vitest";
import {
  contactsCompositeNomCouple,
  contactsSameNomCouple,
} from "./__fixtures__/import-couple-fixtures";
import {
  analyzeCoupleContact,
  extractCompositeName,
  extractCoupleNames,
  extractIndividualNames,
  findFoyerForCouple,
  isContactCouple,
} from "./contact-import-couple";

describe("extractCompositeName", () => {
  it("jointe les noms avec et", () => {
    expect(extractCompositeName("NOM1 et NOM2")).toBe("NOM1-NOM2");
  });

  it("laisse un nom simple", () => {
    expect(extractCompositeName("NOM1")).toBe("NOM1");
  });
});

describe("extractCoupleNames", () => {
  it("extrait deux prénoms", () => {
    expect(extractCoupleNames("Marie et Pierre")).toEqual({
      prenom1: "Marie",
      prenom2: "Pierre",
    });
  });
});

describe("extractIndividualNames", () => {
  it("extrait deux noms de famille", () => {
    expect(extractIndividualNames("NOM1 et NOM2")).toEqual({
      nom1: "NOM1",
      nom2: "NOM2",
    });
  });
});

describe("isContactCouple", () => {
  it("détecte et / &", () => {
    expect(isContactCouple("Jean et Marie")).toBe(true);
    expect(isContactCouple("Jean")).toBe(false);
  });
});

describe("findFoyerForCouple", () => {
  it("retourne le foyer commun", () => {
    expect(
      findFoyerForCouple("NOM1", "Jean", "Veronique", contactsSameNomCouple)
    ).toBe(10);
  });

  it("gère noms composés NOM1 et NOM2", () => {
    expect(
      findFoyerForCouple("NOM1 et NOM2", "Jeremy", "Gaelle", contactsCompositeNomCouple)
    ).toBe(20);
  });
});

describe("analyzeCoupleContact", () => {
  it("ignore une ligne non-couple", () => {
    const r = analyzeCoupleContact("Jean", "NOM1", contactsSameNomCouple);
    expect(r.shouldSkipContact).toBe(false);
  });

  it("CAS 1 : deux contacts existants + foyer", () => {
    const r = analyzeCoupleContact(
      "Jean et Veronique",
      "NOM1",
      contactsSameNomCouple
    );
    expect(r.shouldSkipContact).toBe(true);
    expect(r.foyerId).toBe(10);
    expect(r.contact1?.id).toBe(1);
    expect(r.contact2?.id).toBe(2);
  });

  it("CAS 2.5 : un seul contact → créer l'autre", () => {
    const r = analyzeCoupleContact("Jean et Paul", "NOM1", [
      contactsSameNomCouple[0],
    ]);
    expect(r.shouldCreateContact2).toBe(true);
    expect(r.foyerId).toBe(10);
  });

  it("CAS 3 : aucun contact → créer les deux", () => {
    const r = analyzeCoupleContact("Alice et Bob", "NOMX", []);
    expect(r.shouldCreateContacts).toBe(true);
    expect(r.prenom1).toBe("Alice");
    expect(r.prenom2).toBe("Bob");
  });
});
