import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { groupPipeTimelineByYearMonth } from "./pipe-timeline-groups";

function entry(id: number, occurredAt: number): PipeTimelineEntryRecord {
  return {
    id,
    pipe_id: 1,
    entry_type: "NOTE",
    titre: "Note",
    contenu: null,
    occurred_at: occurredAt,
    created_at: occurredAt,
  };
}

describe("groupPipeTimelineByYearMonth", () => {
  it("regroupe par année et mois, du plus ancien au plus récent", () => {
    const jan = Math.floor(new Date("2026-01-15T10:00:00").getTime() / 1000);
    const jul = Math.floor(new Date("2026-07-10T10:00:00").getTime() / 1000);
    const julLate = Math.floor(new Date("2026-07-20T10:00:00").getTime() / 1000);
    const old = Math.floor(new Date("2025-12-01T10:00:00").getTime() / 1000);

    const groups = groupPipeTimelineByYearMonth([
      entry(1, jan),
      entry(2, julLate),
      entry(3, jul),
      entry(4, old),
    ]);

    expect(groups.map((g) => g.year)).toEqual([2025, 2026]);
    expect(groups[1].months.map((m) => m.label)).toEqual(["Janvier", "Juillet"]);
    expect(groups[1].months[1].items.map((e) => e.id)).toEqual([3, 2]);
  });
});
