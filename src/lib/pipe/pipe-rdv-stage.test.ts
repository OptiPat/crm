import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  formatRdvEntryDisplayLabel,
  isRdvStageAdvanceDue,
  pickDueRdvStageAdvanceTarget,
  rdvStageFromEntryTitre,
} from "@/lib/pipe/pipe-rdv-stage";

const mkRdv = (
  id: number,
  stage: string,
  occurredAt: number
): PipeTimelineEntryRecord => ({
  id,
  pipe_id: 1,
  entry_type: "RDV",
  titre: stage,
  contenu: "CR test",
  occurred_at: occurredAt,
  created_at: occurredAt,
});

describe("pipe-rdv-stage", () => {
  it("lit le type RDV depuis le titre", () => {
    expect(rdvStageFromEntryTitre("R1")).toBe("R1");
    expect(rdvStageFromEntryTitre("Appel")).toBeNull();
  });

  it("formate l'affichage RDV R1", () => {
    expect(formatRdvEntryDisplayLabel({ entry_type: "RDV", titre: "R2" })).toBe("RDV R2");
  });

  it("considère échu à partir du jour calendaire du RDV", () => {
    const noonToday = Math.floor(new Date(2026, 6, 11, 12, 0).getTime() / 1000);
    const now = new Date(2026, 6, 11, 8, 0);
    expect(isRdvStageAdvanceDue(noonToday, now)).toBe(true);

    const future = Math.floor(new Date(2026, 6, 20, 10, 0).getTime() / 1000);
    expect(isRdvStageAdvanceDue(future, now)).toBe(false);
  });

  it("propose R1 si prospection et RDV R1 échu", () => {
    const ts = Math.floor(new Date(2026, 6, 10, 15, 0).getTime() / 1000);
    const target = pickDueRdvStageAdvanceTarget("PROSPECTION", [mkRdv(1, "R1", ts)]);
    expect(target?.stage).toBe("R1");
  });

  it("ignore RDV futur", () => {
    const ts = Math.floor(new Date(2026, 6, 20, 15, 0).getTime() / 1000);
    const target = pickDueRdvStageAdvanceTarget("PROSPECTION", [mkRdv(1, "R1", ts)]);
    expect(target).toBeNull();
  });
});
