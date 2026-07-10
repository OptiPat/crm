import { describe, expect, it } from "vitest";
import {
  isStelliumImmoActifCategory,
  isStelliumLocatifAggregateType,
  mapStelliumImmoSchemeLabel,
} from "./immo-scheme-label";

describe("immo-scheme-label", () => {
  it("mappe les dispositifs fiscaux legacy Stellium", () => {
    expect(mapStelliumImmoSchemeLabel("Robien - Lyon")).toBe("ROBIEN");
    expect(mapStelliumImmoSchemeLabel("Besson")).toBe("BESSON");
    expect(mapStelliumImmoSchemeLabel("Denormandie")).toBe("DENORMANDIE");
    expect(mapStelliumImmoSchemeLabel("Malraux")).toBe("MALRAUX");
  });

  it("reconnaît les catégories actifs immo", () => {
    expect(isStelliumImmoActifCategory("Robien")).toBe(true);
    expect(isStelliumImmoActifCategory("Livret classique")).toBe(false);
  });

  it("agrège le locatif pour tous les types immo hors résidence", () => {
    expect(isStelliumLocatifAggregateType("ROBIEN")).toBe(true);
    expect(isStelliumLocatifAggregateType("RESIDENCE_PRINCIPALE")).toBe(false);
  });
});
