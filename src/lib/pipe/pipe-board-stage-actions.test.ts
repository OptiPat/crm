import { describe, expect, it } from "vitest";
import { resolvePipeBoardStageDrop } from "@/lib/pipe/pipe-board-stage-actions";

describe("resolvePipeBoardStageDrop", () => {
  it("ignore même colonne", () => {
    expect(resolvePipeBoardStageDrop("R1_POSITIONNE", "R1_POSITIONNE")).toEqual({
      kind: "ignore",
    });
  });

  it("ignore prospection et réalisé", () => {
    expect(resolvePipeBoardStageDrop("PROSPECTION", "PROSPECTION")).toEqual({
      kind: "ignore",
    });
    expect(resolvePipeBoardStageDrop("R1_POSITIONNE", "R1_REALISE")).toEqual({
      kind: "ignore",
    });
  });

  it("planifie RDV pour les colonnes positionné", () => {
    expect(resolvePipeBoardStageDrop("PROSPECTION", "R1_POSITIONNE")).toEqual({
      kind: "plan-rdv",
      rdvStage: "R1",
    });
    expect(resolvePipeBoardStageDrop("R1_POSITIONNE", "R2_POSITIONNE")).toEqual({
      kind: "plan-rdv",
      rdvStage: "R2",
    });
  });

  it("avancement manuel pour étapes terminales", () => {
    expect(resolvePipeBoardStageDrop("R3_REALISE", "GAGNEE")).toEqual({
      kind: "manual-advance",
      stage: "GAGNEE",
    });
    expect(resolvePipeBoardStageDrop("R2_POSITIONNE", "PERDUE_OU_EN_ATTENTE")).toEqual({
      kind: "manual-advance",
      stage: "PERDUE_OU_EN_ATTENTE",
    });
  });
});
