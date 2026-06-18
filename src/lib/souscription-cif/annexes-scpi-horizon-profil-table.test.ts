import { describe, expect, it } from "vitest";
import { buildAnnexesScpiHorizonProfilRowViews } from "@/lib/souscription-cif/annexes-scpi-horizon-profil-table";

describe("buildAnnexesScpiHorizonProfilRowViews", () => {
  it("coche + de 10 ans et le profil SRI du contact", () => {
    const rows = buildAnnexesScpiHorizonProfilRowViews(4);

    expect(rows).toHaveLength(5);
    expect(rows[2].horizon).toEqual({
      kind: "check",
      label: "+ de 10 ans",
      checked: true,
    });
    expect(rows[0].profileLabel).toBe("Sécurisé");
    expect(rows[0].profileChecked).toBe(false);
    expect(rows[3].profileLabel).toBe("Dynamique");
    expect(rows[3].profileChecked).toBe(true);
    expect(rows[3].horizon).toEqual({ kind: "empty" });
  });

  it("laisse les profils décochés sans SRI contact", () => {
    const rows = buildAnnexesScpiHorizonProfilRowViews(null);
    expect(rows.every((r) => !r.profileChecked)).toBe(true);
  });
});
