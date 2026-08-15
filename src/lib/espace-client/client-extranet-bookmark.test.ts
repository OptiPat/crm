import { describe, expect, it } from "vitest";
import {
  extranetBookmarkDelta,
  isExtranetBookmarkEligible,
  normalizeExtranetBookmarkUrl,
} from "./client-extranet-bookmark";

describe("isExtranetBookmarkEligible", () => {
  it("accepte placements, SCPI et épargne, refuse immo et meubles", () => {
    expect(isExtranetBookmarkEligible("ASSURANCE_VIE")).toBe(true);
    expect(isExtranetBookmarkEligible("PER")).toBe(true);
    expect(isExtranetBookmarkEligible("SCPI")).toBe(true);
    expect(isExtranetBookmarkEligible("LIVRET_A")).toBe(true);
    expect(isExtranetBookmarkEligible("PINEL")).toBe(false);
    expect(isExtranetBookmarkEligible("LMNP")).toBe(false);
    expect(isExtranetBookmarkEligible("BIJOUX")).toBe(false);
    expect(isExtranetBookmarkEligible("PREVOYANCE")).toBe(false);
  });

  it("accepte une ligne marquée SCPI même si le type est atypique", () => {
    expect(isExtranetBookmarkEligible("AUTRE", true)).toBe(true);
  });
});

describe("normalizeExtranetBookmarkUrl", () => {
  it("vide = pas de lien", () => {
    expect(normalizeExtranetBookmarkUrl("  ")).toBeNull();
  });

  it("préfixe https et refuse http, identifiants, javascript", () => {
    expect(normalizeExtranetBookmarkUrl("extranet.swisslife.fr")).toBe(
      "https://extranet.swisslife.fr/"
    );
    expect(
      normalizeExtranetBookmarkUrl("https://espace.generali.fr/login")
    ).toBe("https://espace.generali.fr/login");
    expect(normalizeExtranetBookmarkUrl("http://extranet.swisslife.fr")).toBe(
      "invalid"
    );
    expect(
      normalizeExtranetBookmarkUrl("https://user:secret@extranet.swisslife.fr")
    ).toBe("invalid");
    expect(normalizeExtranetBookmarkUrl("javascript:alert(1)")).toBe("invalid");
  });
});

describe("extranetBookmarkDelta", () => {
  it("ne voit pas de changement si le client reprend l'URL déjà enregistrée", () => {
    expect(
      extranetBookmarkDelta(
        "https://espace.assureur.fr",
        "https://espace.assureur.fr/"
      )
    ).toBe("unchanged");
    expect(extranetBookmarkDelta("", null)).toBe("unchanged");
    expect(extranetBookmarkDelta("  ", "")).toBe("unchanged");
  });

  it("signale une nouvelle URL, un effacement, ou une saisie invalide", () => {
    expect(extranetBookmarkDelta("espace.assureur.fr", null)).toEqual({
      url: "https://espace.assureur.fr/",
    });
    expect(
      extranetBookmarkDelta("", "https://espace.assureur.fr/")
    ).toEqual({ url: null });
    expect(extranetBookmarkDelta("http://espace.assureur.fr", null)).toBe(
      "invalid"
    );
  });
});
