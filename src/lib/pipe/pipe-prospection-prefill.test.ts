import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { buildProspectionToR1Prefill } from "@/lib/pipe/pipe-prospection-prefill";

const creation: PipeTimelineEntryRecord = {
  id: 1,
  pipe_id: 1,
  entry_type: "CREATION",
  titre: "Affaire",
  contenu: "Contexte initial",
  occurred_at: 1000,
  created_at: 1000,
};

const appel: PipeTimelineEntryRecord = {
  id: 2,
  pipe_id: 1,
  entry_type: "APPEL",
  titre: "Appel",
  contenu: "Intéressé par SCPI",
  occurred_at: 2000,
  created_at: 2000,
};

describe("buildProspectionToR1Prefill", () => {
  it("assemble source, prescripteur, notes et dernier échange", () => {
    const text = buildProspectionToR1Prefill({
      sourceLead: "Recommandation",
      prescripteurLabel: "LEGRAND Paul",
      pipeNotes: "Contexte initial",
      timelineEntries: [creation, appel],
    });
    expect(text).toContain("Source : Recommandation");
    expect(text).toContain("Prescripteur : LEGRAND Paul");
    expect(text).toContain("Contexte initial");
    expect(text).toContain("Dernier appel : Intéressé par SCPI");
  });
});
