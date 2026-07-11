import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  formatTimelineStepDuration,
  getMilestoneDurationLabel,
} from "./pipe-timeline-duration";

function milestone(id: number, type: "CREATION" | "AVANCEMENT", ts: number, titre = "R1") {
  return {
    id,
    pipe_id: 1,
    entry_type: type,
    titre,
    contenu: null,
    occurred_at: ts,
    created_at: ts,
  } satisfies PipeTimelineEntryRecord;
}

describe("formatTimelineStepDuration", () => {
  it("formate minutes et heures", () => {
    const from = Math.floor(new Date("2026-07-11T10:31:00").getTime() / 1000);
    const to = Math.floor(new Date("2026-07-11T11:00:00").getTime() / 1000);
    expect(formatTimelineStepDuration(from, to)).toBe("29 min");
  });
});

describe("getMilestoneDurationLabel", () => {
  it("calcule la durée entre deux jalons", () => {
    const from = Math.floor(new Date("2026-07-11T10:31:00").getTime() / 1000);
    const to = Math.floor(new Date("2026-07-11T11:00:00").getTime() / 1000);
    const entries = [
      milestone(1, "CREATION", from),
      milestone(2, "AVANCEMENT", to, "R1"),
    ];
    expect(getMilestoneDurationLabel(entries[1], entries, { pipeType: "AFFAIRE" })).toBe(
      "29 min depuis Prospection"
    );
  });
});
