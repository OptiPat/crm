import { describe, expect, it } from "vitest";
import { formatCoachProgressLabel } from "@/lib/fund-watchlist/fund-watchlist-coach-progress";

describe("formatCoachProgressLabel", () => {
  it("affiche la collecte avec le nom du fonds", () => {
    expect(
      formatCoachProgressLabel({
        phase: "collecting",
        current: 12,
        total: 26,
        fundName: "Carmignac Portfolio Asia Discovery A EUR Acc",
      })
    ).toBe("Collecte 12/26 — Carmignac Portfolio Asia Discovery A EUR…");
  });

  it("affiche la phase IA", () => {
    expect(
      formatCoachProgressLabel({
        phase: "llm",
        current: 26,
        total: 26,
      })
    ).toBe("Analyse IA en cours…");
  });
});
