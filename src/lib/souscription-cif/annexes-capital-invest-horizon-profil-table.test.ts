import { describe, expect, it } from "vitest";
import { buildAnnexesCapitalInvestHorizonProfilRowViews } from "@/lib/souscription-cif/annexes-capital-invest-horizon-profil-table";

describe("buildAnnexesCapitalInvestHorizonProfilRowViews", () => {
  it("coche de 7 à 10 ans et le profil SRI du contact", () => {
    const rows = buildAnnexesCapitalInvestHorizonProfilRowViews(3);

    expect(rows).toHaveLength(5);
    expect(rows[2].horizon).toEqual({
      kind: "check",
      label: "de 7 à 10 ans",
      checked: true,
    });
    expect(rows[0].profileLabel).toBe("Sécurisé");
    expect(rows[2].profileLabel).toBe("Équilibré");
    expect(rows[2].profileChecked).toBe(true);
    expect(rows[3].profileLabel).toBe("Dynamique");
    expect(rows[3].horizon).toEqual({ kind: "empty" });
  });

  it("laisse les profils décochés sans SRI contact", () => {
    const rows = buildAnnexesCapitalInvestHorizonProfilRowViews(null);
    expect(rows.every((r) => !r.profileChecked)).toBe(true);
  });
});
