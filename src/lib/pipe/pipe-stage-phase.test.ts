import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  getAllStagePhaseUserEntryIds,
  getCanonicalStageMilestones,
  getOrderedStageMilestones,
  getPhaseUserEntriesForMilestone,
  getVisiblePipeTimelineEntries,
  isHiddenStageMilestoneEntry,
  resolveUserEntryMilestoneId,
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

    const milestones = getCanonicalStageMilestones(entries, context);
    const r1Phase = getPhaseUserEntriesForMilestone(r1Milestone, milestones, entries);

    expect(r1Phase).toEqual([rdvR1]);
    expect(getAllStagePhaseUserEntryIds(entries, context).has(rdvR1.id)).toBe(true);
  });

  it("rattache un RDV R1 au jalon même si créé juste avant le jalon (horodatage)", () => {
    const creation = mk(1, "CREATION", "Affaire", 100);
    const rdvR1 = mk(2, "RDV", "R1", 101);
    const r1Milestone = mk(3, "AVANCEMENT", "R1", 102);
    const entries = [creation, rdvR1, r1Milestone];

    const milestones = getCanonicalStageMilestones(entries, context);
    expect(getPhaseUserEntriesForMilestone(r1Milestone, milestones, entries)).toEqual([rdvR1]);
    expect(getAllStagePhaseUserEntryIds(entries, context).has(rdvR1.id)).toBe(true);
  });

  it("rattache un RDV R1 au jalon à timestamp identique", () => {
    const creation = mk(1, "CREATION", "Affaire", 100);
    const r1Milestone = mk(2, "AVANCEMENT", "R1", 200);
    const rdvR1 = mk(3, "RDV", "R1", 200);
    const entries = [creation, r1Milestone, rdvR1];

    const milestones = getCanonicalStageMilestones(entries, context);
    expect(getPhaseUserEntriesForMilestone(r1Milestone, milestones, entries)).toEqual([rdvR1]);
  });

  it("garde les activités prospection avant le premier avancement", () => {
    const creation = mk(1, "CREATION", "Affaire", 100);
    const appel = mk(2, "APPEL", "Appel", 150);
    const r1Milestone = mk(3, "AVANCEMENT", "R1", 200);
    const entries = [creation, appel, r1Milestone];

    const milestones = getCanonicalStageMilestones(entries, context);
    const prospPhase = getPhaseUserEntriesForMilestone(creation, milestones, entries);

    expect(prospPhase).toEqual([appel]);
  });

  it("n'affiche qu'un jalon prospection malgré un retour prospection", () => {
    const creation = mk(1, "CREATION", "Affaire", 100);
    const backToProsp = mk(2, "AVANCEMENT", "PROSPECTION", 150);
    const r1Milestone = mk(3, "AVANCEMENT", "R1", 200);
    const entries = [creation, backToProsp, r1Milestone];

    const all = getOrderedStageMilestones(entries, context);
    const canonical = getCanonicalStageMilestones(entries, context);

    expect(all).toHaveLength(3);
    expect(canonical).toHaveLength(2);
    expect(canonical.map((m) => m.stage)).toEqual(["PROSPECTION", "R1"]);
  });

  it("laisse les traces RDV annulé/reporté dans le fil chronologique (hors jalon)", () => {
    const creation = mk(1, "CREATION", "Affaire", 100);
    const r1Milestone = mk(2, "AVANCEMENT", "R1", 200);
    const cancelNote = {
      ...mk(3, "NOTE", null, 500),
      contenu: "RDV R1 annulé : client indisponible",
    };
    const entries = [creation, r1Milestone, cancelNote];

    const milestones = getCanonicalStageMilestones(entries, context);
    expect(resolveUserEntryMilestoneId(cancelNote, milestones, entries)).toBeNull();
    expect(getAllStagePhaseUserEntryIds(entries, context).has(cancelNote.id)).toBe(false);
    expect(getVisiblePipeTimelineEntries(entries, context)).toContainEqual(cancelNote);
  });

  it("masque le jalon PROSPECTION AVANCEMENT après retour prospection", () => {
    const creation = mk(1, "CREATION", "Affaire", 100);
    const backToProsp = mk(2, "AVANCEMENT", "PROSPECTION", 500);
    const r1Milestone = mk(3, "AVANCEMENT", "R1", 200);
    const entries = [creation, backToProsp, r1Milestone];

    expect(isHiddenStageMilestoneEntry(backToProsp, entries, context)).toBe(true);
    expect(getVisiblePipeTimelineEntries(entries, context).map((e) => e.id)).toEqual([
      creation.id,
      r1Milestone.id,
    ]);
  });

  it("laisse aussi les notes de report dans le fil chronologique", () => {
    const creation = mk(1, "CREATION", "Affaire", 100);
    const r2Milestone = mk(2, "AVANCEMENT", "R2", 200);
    const rdvR2 = mk(3, "RDV", "R2", 300);
    const rescheduleNote = {
      ...mk(4, "NOTE", null, 400),
      contenu: "RDV R2 reporté : était le 01 janv. 2026, 10:00 → 08 janv. 2026, 10:00",
    };
    const entries = [creation, r2Milestone, rdvR2, rescheduleNote];

    const milestones = getCanonicalStageMilestones(entries, context);
    expect(getPhaseUserEntriesForMilestone(r2Milestone, milestones, entries)).toEqual([rdvR2]);
    expect(resolveUserEntryMilestoneId(rescheduleNote, milestones, entries)).toBeNull();
  });
});
