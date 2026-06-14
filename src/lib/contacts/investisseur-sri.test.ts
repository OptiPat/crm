import { describe, expect, it } from "vitest";
import {
  formatSriLabel,
  formatSriWithDefinition,
  getSriProfile,
  getSriProfileLabel,
} from "@/lib/contacts/investisseur-sri";

describe("investisseur-sri", () => {
  it("retourne le profil pour un SRI valide", () => {
    expect(getSriProfile(4)?.label).toBe("Dynamique");
    expect(getSriProfileLabel(1)).toBe("Sécurisé");
    expect(getSriProfile(7)?.label).toBe("Offensif +");
  });

  it("formate SRI + définition pour les documents CIF", () => {
    expect(formatSriLabel(4)).toBe("4 — Dynamique");
    expect(formatSriWithDefinition(4)).toContain("SRI 4 — Dynamique");
    expect(formatSriWithDefinition(4)).toContain("croissance à long terme");
  });

  it("ignore les valeurs hors plage", () => {
    expect(getSriProfile(0)).toBeNull();
    expect(formatSriWithDefinition(8)).toBeNull();
  });
});
