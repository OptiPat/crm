import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  buildFlatTimelineDurationLabels,
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

describe("buildFlatTimelineDurationLabels", () => {
  it("calcule la durée entre entrées consécutives", () => {
    const from = Math.floor(new Date("2026-07-13T20:10:00").getTime() / 1000);
    const to = Math.floor(new Date("2026-07-15T06:56:00").getTime() / 1000);
    const entries = [
      milestone(1, "CREATION", from),
      milestone(2, "AVANCEMENT", to, "R1"),
    ];
    const labels = buildFlatTimelineDurationLabels(entries, { pipeType: "AFFAIRE" });
    expect(labels.get(2)).toBe("1 jour depuis prospection");
  });

  it("utilise le titre de la note précédente pour la durée suivi", () => {
    const from = Math.floor(new Date("2026-07-14T12:18:00").getTime() / 1000);
    const mid = Math.floor(new Date("2026-07-14T18:09:00").getTime() / 1000);
    const to = Math.floor(new Date("2026-07-15T10:30:00").getTime() / 1000);
    const entries = [
      milestone(1, "CREATION", from),
      {
        id: 2,
        pipe_id: 1,
        entry_type: "NOTE",
        titre: "Arbitrage libre — Cristalliance Evoluvie",
        contenu: "SCI VIA GENERATIONS",
        occurred_at: mid,
        created_at: mid,
      },
      {
        id: 3,
        pipe_id: 1,
        entry_type: "NOTE",
        titre: "Réponse Stellium — Conforme",
        contenu: "Détail",
        occurred_at: to,
        created_at: to,
      },
    ];
    const labels = buildFlatTimelineDurationLabels(entries, { pipeType: "ACTE_GESTION" });
    expect(labels.get(2)).toBe(
      "5 h 51 min depuis création du suivi"
    );
    expect(labels.get(3)).toBe(
      "16 h 21 min depuis arbitrage libre — cristalliance evoluvie"
    );
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
