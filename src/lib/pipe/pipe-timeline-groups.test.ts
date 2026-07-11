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
  it("regroupe par année et mois, du plus récent au plus ancien", () => {
    const jan = Math.floor(new Date("2026-01-15T10:00:00").getTime() / 1000);
    const jul = Math.floor(new Date("2026-07-10T10:00:00").getTime() / 1000);
    const old = Math.floor(new Date("2025-12-01T10:00:00").getTime() / 1000);

    const groups = groupPipeTimelineByYearMonth([
      entry(1, jan),
      entry(2, jul),
      entry(3, old),
    ]);

    expect(groups.map((g) => g.year)).toEqual([2026, 2025]);
    expect(groups[0].months.map((m) => m.label)).toEqual(["Juillet", "Janvier"]);
    expect(groups[0].months[0].items.map((e) => e.id)).toEqual([2]);
  });
});
