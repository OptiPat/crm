import { describe, expect, it } from "vitest";
import {
  formatSriLabel,
  formatSriWithDefinition,
  getSriProfile,
  getSriProfileLabel,
  PROFIL_RISQUE_MAX,
} from "@/lib/contacts/investisseur-sri";

describe("investisseur-sri", () => {
  it("retourne le profil pour un niveau valide (1–5)", () => {
    expect(PROFIL_RISQUE_MAX).toBe(5);
    expect(getSriProfile(4)?.label).toBe("Dynamique");
    expect(getSriProfileLabel(1)).toBe("Sécurisé");
    expect(getSriProfile(5)?.label).toBe("Offensif");
  });

  it("formate profil + définition pour les documents CIF", () => {
    expect(formatSriLabel(4)).toBe("4/5 — Dynamique");
    expect(formatSriWithDefinition(4)).toContain("SRI 4/5 — Dynamique");
    expect(formatSriWithDefinition(4)).toContain("marchés volatils");
    expect(formatSriWithDefinition(1)).toContain("Vous ne souhaitez pas prendre de risques");
  });

  it("ignore les valeurs hors plage", () => {
    expect(getSriProfile(0)).toBeNull();
    expect(getSriProfile(6)).toBeNull();
    expect(formatSriWithDefinition(7)).toBeNull();
  });
});
