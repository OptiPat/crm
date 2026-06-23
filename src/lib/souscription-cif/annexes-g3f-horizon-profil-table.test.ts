import { describe, expect, it } from "vitest";
import { buildAnnexesG3fHorizonProfilRowViews } from "@/lib/souscription-cif/annexes-g3f-horizon-profil-table";

describe("buildAnnexesG3fHorizonProfilRowViews", () => {
  it("coche l'horizon de 3 à 8 ans et le profil SRI du contact", () => {
    const rows = buildAnnexesG3fHorizonProfilRowViews(2);
    expect(rows[0]?.horizon).toEqual({ kind: "check", label: "< à 3 ans", checked: false });
    expect(rows[1]?.horizon).toEqual({ kind: "check", label: "de 3 à 8 ans", checked: true });
    expect(rows[2]?.horizon).toEqual({ kind: "check", label: "+ de 10 ans", checked: false });
    expect(rows[1]?.profileChecked).toBe(true);
    expect(rows[1]?.profileLabel).toBe("Prudent");
  });

  it("laisse les profils décochés sans SRI contact", () => {
    const rows = buildAnnexesG3fHorizonProfilRowViews(null);
    expect(rows.every((r) => !r.profileChecked)).toBe(true);
    expect(rows[1]?.horizon).toMatchObject({ checked: true });
  });
});
