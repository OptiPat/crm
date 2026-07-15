import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  getEffectiveActiveLinearIndex,
  getPipeCommercialStepperStepState,
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

  it("conserve R2 actif tant que le RDV R2 n'est pas terminé", () => {
    const r2Start = Math.floor(new Date(2026, 7, 11, 8, 0).getTime() / 1000);
    const entries = [mkRdv(1, "R1", r1Start), mkRdv(2, "R2", r2Start)];
    const beforeR2 = new Date(2026, 7, 11, 8, 30);
    expect(getPipeCommercialStepperStepState("R1", "R2", entries, beforeR2)).toBe("done");
    expect(getPipeCommercialStepperStepState("R2", "R2", entries, beforeR2)).toBe("active");
    expect(getPipeCommercialStepperStepState("R3", "R2", entries, beforeR2)).toBe("pending");
  });
});
