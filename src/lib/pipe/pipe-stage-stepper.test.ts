import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  getEffectiveActiveLinearIndex,
  getPipeCommercialStepperStepState,
  getSuggestedRdvPlanStage,
  shouldShowPlanAnotherR3,
} from "@/lib/pipe/pipe-stage-stepper";

const mkRdv = (
  id: number,
  stage: string,
  occurredAt: number
): PipeTimelineEntryRecord => ({
  id,
  pipe_id: 1,
  entry_type: "RDV",
  titre: stage,
  contenu: null,
  occurred_at: occurredAt,
  created_at: occurredAt,
});

describe("pipe-stage-stepper", () => {
  const r1Start = Math.floor(new Date(2026, 6, 15, 8, 0).getTime() / 1000);
  const afterR1 = new Date(2026, 6, 15, 9, 30);

  it("met R1 en cours tant que le RDV R1 n'est pas terminé", () => {
    const duringR1 = new Date(2026, 6, 15, 8, 30);
    const entries = [mkRdv(1, "R1", r1Start)];
    expect(getPipeCommercialStepperStepState("R1", "R1", entries, duringR1)).toBe("active");
    expect(getPipeCommercialStepperStepState("R2", "R1", entries, duringR1)).toBe("pending");
  });

  it("passe R1 en vert et R2 en bleu quand le RDV R1 est terminé", () => {
    const entries = [mkRdv(1, "R1", r1Start)];
    expect(getPipeCommercialStepperStepState("R1", "R1", entries, afterR1)).toBe("done");
    expect(getPipeCommercialStepperStepState("R2", "R1", entries, afterR1)).toBe("active");
    expect(getEffectiveActiveLinearIndex("R1", entries, afterR1)).toBe(2);
  });

  it("suggère R1 quand l'affaire est à R1 sans RDV planifié", () => {
    expect(getSuggestedRdvPlanStage("R1", [])).toBe("R1");
    expect(getSuggestedRdvPlanStage("PROSPECTION", [])).toBe("R1");
  });

  it("suggère R2 dès que le RDV R1 est planifié (même avant la fin du créneau)", () => {
    const entries = [mkRdv(1, "R1", r1Start)];
    const duringR1 = new Date(2026, 6, 15, 8, 30);
    expect(getSuggestedRdvPlanStage("R1", entries, duringR1)).toBe("R2");
    expect(getSuggestedRdvPlanStage("PROSPECTION", entries, duringR1)).toBe("R2");
    expect(getSuggestedRdvPlanStage("R1", entries, afterR1)).toBe("R2");
  });

  it("suggère R2 directement si l'affaire démarre à R2 sans RDV", () => {
    expect(getSuggestedRdvPlanStage("R2", [])).toBe("R2");
  });

  it("conserve R2 actif tant que le RDV R2 n'est pas terminé", () => {
    const r2Start = Math.floor(new Date(2026, 7, 11, 8, 0).getTime() / 1000);
    const entries = [mkRdv(1, "R1", r1Start), mkRdv(2, "R2", r2Start)];
    const beforeR2 = new Date(2026, 7, 11, 8, 30);
    expect(getPipeCommercialStepperStepState("R1", "R2", entries, beforeR2)).toBe("done");
    expect(getPipeCommercialStepperStepState("R2", "R2", entries, beforeR2)).toBe("active");
    expect(getPipeCommercialStepperStepState("R3", "R2", entries, beforeR2)).toBe("pending");
  });

  it("reste sur R3 actif après un RDV R3 terminé (autre R3 possible)", () => {
    const r3Start = Math.floor(new Date(2026, 8, 10, 10, 0).getTime() / 1000);
    const afterR3 = new Date(2026, 8, 10, 12, 0);
    const entries = [mkRdv(1, "R3 Placements", r3Start)];

    expect(getEffectiveActiveLinearIndex("R3", entries, afterR3)).toBe(3);
    expect(getPipeCommercialStepperStepState("R3", "R3", entries, afterR3)).toBe("active");
    expect(getSuggestedRdvPlanStage("R3", entries, afterR3)).toBeNull();
    expect(shouldShowPlanAnotherR3("R3", entries)).toBe(true);
  });

  it("ne propose pas un autre R3 hors étape R3", () => {
    const entries = [mkRdv(1, "R3 Immo", r1Start)];
    expect(shouldShowPlanAnotherR3("R2", entries)).toBe(false);
  });
});
