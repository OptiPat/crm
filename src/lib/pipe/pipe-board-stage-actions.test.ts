import { describe, expect, it } from "vitest";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { resolvePipeBoardStageDrop } from "@/lib/pipe/pipe-board-stage-actions";

function affaire(stage: PipeRecord["stage"]): Pick<PipeRecord, "stage"> {
  return { stage };
}

describe("resolvePipeBoardStageDrop", () => {
  it("ignore même colonne", () => {
    expect(resolvePipeBoardStageDrop(affaire("R1"), "R1")).toEqual({ kind: "ignore" });
  });

  it("ignore prospection", () => {
    expect(resolvePipeBoardStageDrop(affaire("PROSPECTION"), "PROSPECTION")).toEqual({
      kind: "ignore",
    });
  });

  it("planifie RDV pour R1/R2/R3", () => {
    expect(resolvePipeBoardStageDrop(affaire("PROSPECTION"), "R1")).toEqual({
      kind: "plan-rdv",
      rdvStage: "R1",
    });
    expect(resolvePipeBoardStageDrop(affaire("R1"), "R2")).toEqual({
      kind: "plan-rdv",
      rdvStage: "R2",
    });
  });

  it("avancement manuel pour étapes terminales", () => {
    expect(resolvePipeBoardStageDrop(affaire("R3"), "GAGNEE")).toEqual({
      kind: "manual-advance",
      stage: "GAGNEE",
    });
    expect(resolvePipeBoardStageDrop(affaire("R2"), "PERDUE_OU_EN_ATTENTE")).toEqual({
      kind: "manual-advance",
      stage: "PERDUE_OU_EN_ATTENTE",
    });
  });
});
