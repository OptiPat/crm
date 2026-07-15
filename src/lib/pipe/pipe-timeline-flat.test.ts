import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { isFlatTimelineUserEntry } from "./pipe-timeline-flat";

function entry(id: number, type: string, ts: number): PipeTimelineEntryRecord {
  return {
    id,
    pipe_id: 1,
    entry_type: type,
    titre: type === "RDV" ? "R1" : null,
    contenu: null,
    occurred_at: ts,
    created_at: ts,
  };
}

describe("pipe-timeline-flat", () => {
  it("détecte les entrées utilisateur affichables en timeline plate", () => {
    expect(isFlatTimelineUserEntry(entry(1, "NOTE", 100))).toBe(true);
    expect(isFlatTimelineUserEntry(entry(2, "RDV", 200))).toBe(true);
    expect(isFlatTimelineUserEntry(entry(3, "CREATION", 50))).toBe(false);
    expect(isFlatTimelineUserEntry(entry(4, "AVANCEMENT", 150))).toBe(false);
  });
});
