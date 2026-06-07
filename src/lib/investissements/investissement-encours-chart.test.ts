import { describe, expect, it } from "vitest";
import { buildEncoursChartPoints } from "./investissement-encours-chart";
import { dateInputToUnix } from "@/lib/dates/calendar-date";

describe("buildEncoursChartPoints", () => {
  it("affiche souscription puis complément avec barre", () => {
    const subTs = dateInputToUnix("2023-01-01")!;
    const vcTs = dateInputToUnix("2026-01-01")!;
    const points = buildEncoursChartPoints(
      30_000_000,
      subTs,
      [],
      [{ id: 1, investissement_id: 1, montant: 6_000_000, date_versement: vcTs, created_at: 0 }]
    );
    expect(points).toHaveLength(2);
    expect(points[0].kind).toBe("souscription");
    expect(points[0].encours).toBe(300_000);
    expect(points[1].kind).toBe("complement");
    expect(points[1].encours).toBe(360_000);
    expect(points[1].complementBar).toBe(60_000);
  });

  it("réinitialise les compléments après une valorisation", () => {
    const subTs = dateInputToUnix("2023-01-01")!;
    const valTs = dateInputToUnix("2024-06-01")!;
    const vcTs = dateInputToUnix("2026-01-01")!;
    const points = buildEncoursChartPoints(
      10_000_00,
      subTs,
      [{ id: 10, investissement_id: 1, montant: 12_000_000, date_valorisation: valTs, created_at: 0 }],
      [{ id: 2, investissement_id: 1, montant: 1_000_000, date_versement: vcTs, created_at: 0 }]
    );
    const complement = points.find((p) => p.kind === "complement");
    expect(complement?.encours).toBe(130_000);
    expect(complement?.complementBar).toBe(10_000);
  });
});
