import { describe, expect, it } from "vitest";
import {
  buildDefaultConseil,
  DEFAULT_CONSEIL_TEXT,
} from "@/lib/souscription-cif/build-default-annexes-fields";
import {
  buildMesPreconisationsFromSouscriptions,
  defaultScpiAnnexeSouscriptions,
} from "@/lib/souscription-cif/scpi-annexe-souscriptions";

describe("buildDefaultAnnexesFields", () => {
  it("retourne le texte type Conseil", () => {
    expect(buildDefaultConseil()).toBe(DEFAULT_CONSEIL_TEXT);
  });

  it("génère Mes préconisations depuis souscriptions type (réinvest. + VP)", () => {
    const text = buildMesPreconisationsFromSouscriptions(defaultScpiAnnexeSouscriptions());
    expect(text).toMatch(/30[\s\u202f]?000/);
    expect(text).toContain("Comète");
    expect(text).toContain("250 € la part x 120 parts");
    expect(text).toContain("réinvestissement automatique de 100% des dividendes");
    expect(text).toContain("50 €/mois de versements programmés");
  });
});
