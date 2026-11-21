import { describe, expect, it } from "vitest";
import { coachReportStatus } from "@/lib/fund-watchlist/fund-watchlist-coach-status";

const generatedAt = Math.floor(new Date(2026, 7, 8, 7, 25, 50).getTime() / 1000);

describe("état du rapport Coach", () => {
  it("date lisible sans heure ni secondes, nombre de fonds", () => {
    const status = coachReportStatus({ generatedAt, favoriteCount: 27, currentFavorites: 27 });
    expect(status.label).toBe("Rapport Coach du 8 août 2026 · 27 fonds");
    expect(status.staleHint).toBeNull();
  });

  it("signale des favoris changés depuis le rapport", () => {
    const status = coachReportStatus({ generatedAt, favoriteCount: 27, currentFavorites: 28 });
    expect(status.staleHint).toBe(
      "Vos favoris ont changé depuis (28 aujourd'hui) : mettez le rapport à jour."
    );
  });
});
