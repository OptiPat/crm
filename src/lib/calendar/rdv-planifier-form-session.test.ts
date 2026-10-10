import { describe, expect, it } from "vitest";
import { rdvPlanifierFormSessionKey } from "@/lib/calendar/rdv-planifier-form-session";

describe("rdvPlanifierFormSessionKey", () => {
  const pipe = { id: 12, titre: "Affaire" };

  it("reste stable si le parent recrée l'objet avec la même affaire et le même type", () => {
    const a = rdvPlanifierFormSessionKey({
      kind: "pipe",
      pipe,
      rdvPlanOption: "R2_PLACEMENT",
      rdvStage: "R2",
    });
    const b = rdvPlanifierFormSessionKey({
      kind: "pipe",
      pipe: { ...pipe },
      rdvPlanOption: "R2_PLACEMENT",
      rdvStage: "R2",
    });
    expect(a).toBe(b);
  });

  it("change quand on ouvre un autre type ou une autre affaire", () => {
    const base = rdvPlanifierFormSessionKey({
      kind: "pipe",
      pipe,
      rdvPlanOption: "R2",
      rdvStage: "R2",
    });
    expect(
      rdvPlanifierFormSessionKey({
        kind: "pipe",
        pipe,
        rdvPlanOption: "R3",
        rdvStage: "R3",
      })
    ).not.toBe(base);
    expect(
      rdvPlanifierFormSessionKey({
        kind: "pipe",
        pipe: { id: 99 },
        rdvPlanOption: "R2",
        rdvStage: "R2",
      })
    ).not.toBe(base);
  });
});
