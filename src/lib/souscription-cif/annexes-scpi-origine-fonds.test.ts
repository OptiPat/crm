import { describe, expect, it } from "vitest";
import {
  collectAnnexesOrigineFondsMissingKeys,
  normalizeOrigineFondsSelected,
  normalizeProvenanceFonds,
} from "@/lib/souscription-cif/annexes-scpi-origine-fonds";
import { defaultSouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

describe("annexes-scpi-origine-fonds", () => {
  it("normalise provenance et origines", () => {
    expect(normalizeProvenanceFonds("metropole")).toBe("metropole");
    expect(normalizeProvenanceFonds("invalid")).toBe("");
    expect(normalizeOrigineFondsSelected(["epargne_courante", "foo", "jeu"])).toEqual([
      "epargne_courante",
      "jeu",
    ]);
  });

  it("détecte les champs manquants", () => {
    expect(collectAnnexesOrigineFondsMissingKeys(defaultSouscriptionDossierFields())).toEqual([
      "provenance_fonds",
      "origine_fonds",
    ]);
    expect(
      collectAnnexesOrigineFondsMissingKeys({
        ...defaultSouscriptionDossierFields(),
        provenanceFonds: "etranger",
        origineFondsSelected: ["autre"],
      })
    ).toEqual([]);
  });
});
