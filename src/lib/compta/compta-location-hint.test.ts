import { describe, expect, it } from "vitest";
import {
  geocodeTargetFromCity,
  locationNeedsCityHint,
  resolveComptaImportDestination,
} from "@/lib/compta/compta-location-hint";

describe("compta-location-hint", () => {
  it("détecte un lieu sans code postal", () => {
    expect(locationNeedsCityHint("Paillote Bambou")).toBe(true);
    expect(locationNeedsCityHint("6 Rue Richelieu, 34000 Montpellier")).toBe(false);
  });

  it("géocode sur la ville seule", () => {
    expect(geocodeTargetFromCity("  la grande motte  ")).toBe("la grande motte");
  });

  it("libellé import avec ville de repli", () => {
    expect(resolveComptaImportDestination("Paillote Bambou", "La Grande-Motte")).toBe(
      "Paillote Bambou (La Grande-Motte)"
    );
  });
});
