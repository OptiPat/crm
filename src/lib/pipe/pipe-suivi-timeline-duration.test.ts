import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  getSuiviDurationLabel,
  getSuiviTimelineAnchors,
} from "./pipe-suivi-timeline-duration";

function entry(
  id: number,
  entry_type: string,
  ts: number,
  titre?: string
): PipeTimelineEntryRecord {
  return {
    id,
    pipe_id: 1,
    entry_type,
    titre: titre ?? null,
    contenu: null,
    occurred_at: ts,
    created_at: ts,
  };
}

describe("pipe-suivi-timeline-duration", () => {
  it("détecte les jalons suivi", () => {
    const from = 100;
    const mid = from + 30 * 60;
    const to = mid + 3 * 24 * 3600;
    const entries = [
      entry(1, "CREATION", from),
      entry(2, "NOTE", mid, "Arbitrage — Fonds A"),
      entry(3, "RDV", to, "Suivi"),
    ];
    const anchors = getSuiviTimelineAnchors(entries, new Set([2]));
    expect(anchors.map((a) => a.entry.id)).toEqual([1, 2, 3]);
    expect(getSuiviDurationLabel(anchors[1].entry, anchors)).toBe(
      "30 min depuis création du suivi"
    );
    expect(getSuiviDurationLabel(anchors[2].entry, anchors)).toBe(
      "3 jours depuis envoi Stellium (Arbitrage — Fonds A)"
    );
  });
});
