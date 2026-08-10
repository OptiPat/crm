import { describe, expect, it } from "vitest";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { HORIZON_CHART_COLORS } from "./patrimoine-palette";
import { aggregateByDisponibilite } from "./patrimoine-charts";

function inv(
  partial: Pick<Investissement, "type_produit" | "origine"> &
    Partial<Investissement>
): Investissement {
  return {
    id: 1,
    contact_id: 1,
    encours_actuel: 100_000_00,
    ...partial,
  } as Investissement;
}

describe("aggregateByDisponibilite", () => {
  it("utilise des couleurs distinctes pour les horizons", () => {
    const slices = aggregateByDisponibilite([
      inv({ type_produit: "ASSURANCE_VIE", origine: "MON_CONSEIL" }),
      inv({ type_produit: "SCPI", origine: "MON_CONSEIL" }),
      inv({ type_produit: "RESIDENCE_PRINCIPALE", origine: "MON_CONSEIL" }),
    ]);

    const byName = Object.fromEntries(slices.map((s) => [s.name, s.color]));

    expect(byName["Moyen terme"]).toBe(HORIZON_CHART_COLORS["Moyen terme"]);
    expect(byName["Long terme"]).toBe(HORIZON_CHART_COLORS["Long terme"]);
    expect(byName["Résidence principale"]).toBe(
      HORIZON_CHART_COLORS["Résidence principale"]
    );
  });
});
