import { describe, expect, it } from "vitest";
import {
  filterVisibleContactPipeEntries,
  groupContactPipeTimelineByYearMonth,
} from "@/lib/interactions/contact-relation-pipe-timeline";
import type { PipeContactTimelineEntry } from "@/lib/api/tauri-pipe-contact-timeline";

function entry(
  id: number,
  occurredAt: number,
  overrides: Partial<PipeContactTimelineEntry> = {}
): PipeContactTimelineEntry {
  return {
    id,
    pipe_id: 10,
    entry_type: "APPEL",
    titre: "Appel",
    contenu: null,
    occurred_at: occurredAt,
    created_at: occurredAt,
    pipe_titre: "Affaire SCPI",
    pipe_type: "AFFAIRE",
    pipe_stage: "R1",
    ...overrides,
  };
}

describe("contact-relation-pipe-timeline", () => {
  it("regroupe par année et mois, récent en haut (ancien en bas)", () => {
    const jan = Math.floor(new Date("2026-01-15T10:00:00").getTime() / 1000);
    const jul = Math.floor(new Date("2026-07-10T10:00:00").getTime() / 1000);
    const julLate = Math.floor(new Date("2026-07-20T10:00:00").getTime() / 1000);
    const old = Math.floor(new Date("2025-12-01T10:00:00").getTime() / 1000);

    const groups = groupContactPipeTimelineByYearMonth([
      entry(1, jan),
      entry(2, julLate),
      entry(3, jul),
      entry(4, old),
    ]);

    expect(groups.map((g) => g.year)).toEqual([2026, 2025]);
    expect(groups[0].months.map((m) => m.label)).toEqual(["Juillet", "Janvier"]);
    expect(groups[0].months[0].items.map((e) => e.id)).toEqual([2, 3]);
  });

  it("masque CREATION et traces RDV techniques", () => {
    const visible = filterVisibleContactPipeEntries([
      entry(1, 1_700_000_000),
      entry(2, 1_690_000_000, { entry_type: "CREATION", titre: "Affaire SCPI" }),
      entry(3, 1_710_000_000, {
        entry_type: "NOTE",
        titre: null,
        contenu: "RDV R2 annulé : indispo",
      }),
    ]);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe(1);
  });
});
