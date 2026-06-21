import { describe, expect, it } from "vitest";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import { groupExchangeHistoryByYearMonth } from "@/lib/interactions/exchange-history-groups";

describe("exchange-history-groups", () => {
  it("regroupe par année et mois décroissants", () => {
    const entries: ExchangeHistoryEntry[] = [
      {
        entry_kind: "manual",
        sort_date: new Date("2026-03-15").getTime() / 1000,
        contact_id: 1,
        contact_nom: "A",
        contact_prenom: "B",
        interaction_id: 1,
        type_interaction: "APPEL",
      },
      {
        entry_kind: "manual",
        sort_date: new Date("2025-11-02").getTime() / 1000,
        contact_id: 1,
        contact_nom: "A",
        contact_prenom: "B",
        interaction_id: 2,
        type_interaction: "NOTE",
      },
    ];
    const groups = groupExchangeHistoryByYearMonth(entries);
    expect(groups).toHaveLength(2);
    expect(groups[0].year).toBe(2026);
    expect(groups[0].months[0].label).toBe("Mars");
    expect(groups[1].year).toBe(2025);
  });
});
