import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  getAllStagePhaseUserEntryIds,
  getOrderedStageMilestones,
  getPhaseUserEntriesForMilestone,
} from "@/lib/pipe/pipe-stage-phase";

const mk = (
  id: number,
  type: string,
  titre: string | null,
  occurredAt: number
): PipeTimelineEntryRecord => ({
  id,
  pipe_id: 1,
  entry_type: type,
  titre,
  contenu: null,
  occurred_at: occurredAt,
  created_at: occurredAt,
});

describe("pipe-stage-phase", () => {
  const context = { pipeType: "AFFAIRE" };

  it("regroupe le RDV R1 sous le jalon R1, pas en ligne orpheline", () => {
    const creation = mk(1, "CREATION", "Affaire", 100);
    const r1Milestone = mk(2, "AVANCEMENT", "R1", 200);
    const rdvR1 = mk(3, "RDV", "R1", 300);
    const entries = [creation, r1Milestone, rdvR1];

    const milestones = getOrderedStageMilestones(entries, context);
    const r1Phase = getPhaseUserEntriesForMilestone(r1Milestone, milestones, entries);

    expect(r1Phase).toEqual([rdvR1]);
    expect(getAllStagePhaseUserEntryIds(entries, context).has(rdvR1.id)).toBe(true);
  });

  it("garde les activités prospection avant le premier avancement", () => {
    const creation = mk(1, "CREATION", "Affaire", 100);
    const appel = mk(2, "APPEL", "Appel", 150);
    const r1Milestone = mk(3, "AVANCEMENT", "R1", 200);
    const entries = [creation, appel, r1Milestone];

    const milestones = getOrderedStageMilestones(entries, context);
    const prospPhase = getPhaseUserEntriesForMilestone(creation, milestones, entries);

    expect(prospPhase).toEqual([appel]);
  });
});
