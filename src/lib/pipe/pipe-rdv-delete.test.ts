import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  isLastRdvForStage,
  phaseEntriesHaveRdv,
  shouldHighlightRevertToProspection,
} from "@/lib/pipe/pipe-rdv-delete";

const mkRdv = (id: number, titre: string): PipeTimelineEntryRecord => ({
  id,
  pipe_id: 1,
  entry_type: "RDV",
  titre,
  contenu: null,
  occurred_at: id * 100,
  created_at: id * 100,
});

describe("pipe-rdv-delete", () => {
  it("détecte le dernier RDV R1", () => {
    const rdv1 = mkRdv(1, "R1");
    const rdv2 = mkRdv(2, "R1");
    expect(isLastRdvForStage(rdv1, [rdv1])).toBe(true);
    expect(isLastRdvForStage(rdv1, [rdv1, rdv2])).toBe(false);
    expect(isLastRdvForStage(rdv2, [rdv1, rdv2])).toBe(false);
  });

  it("propose le retour prospection si dernier RDV et affaire en R1", () => {
    const rdv = mkRdv(1, "R1");
    expect(shouldHighlightRevertToProspection(rdv, [rdv], "R1")).toBe(true);
    expect(shouldHighlightRevertToProspection(rdv, [rdv, mkRdv(2, "R1")], "R1")).toBe(false);
  });

  it("détecte l'absence de RDV dans une phase", () => {
    expect(phaseEntriesHaveRdv([mkRdv(1, "R1")])).toBe(true);
    expect(
      phaseEntriesHaveRdv([
        { ...mkRdv(1, "R1"), entry_type: "APPEL", titre: "Appel" },
      ])
    ).toBe(false);
  });
});
