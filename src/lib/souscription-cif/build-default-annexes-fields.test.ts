import { describe, expect, it } from "vitest";
import {
  buildDefaultConseil,
  buildDefaultMesPreconisations,
  DEFAULT_CONSEIL_TEXT,
  DEFAULT_MES_PRECONISATIONS_TEXT,
} from "@/lib/souscription-cif/build-default-annexes-fields";

describe("buildDefaultAnnexesFields", () => {
  it("retourne le texte type Conseil", () => {
    expect(buildDefaultConseil()).toBe(DEFAULT_CONSEIL_TEXT);
  });

  it("retourne le texte type Mes préconisations", () => {
    expect(buildDefaultMesPreconisations()).toBe(DEFAULT_MES_PRECONISATIONS_TEXT);
    expect(DEFAULT_MES_PRECONISATIONS_TEXT).toContain("30 000 €");
    expect(DEFAULT_MES_PRECONISATIONS_TEXT).toContain("Comète");
  });
});
