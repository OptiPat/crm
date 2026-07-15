import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  applyDueRdvStageAdvance,
  applyRdvStageOnSave,
  formatRdvEntryDisplayLabel,
  isPipeRdvStageCompleted,
  isRdvStageAdvanceDue,
  isRdvTimelineEntryCompleted,
  pickDueRdvStageAdvanceTarget,
  rdvStageFromEntryTitre,
} from "@/lib/pipe/pipe-rdv-stage";
import { setPipeStage } from "@/lib/api/tauri-pipe";

vi.mock("@/lib/api/tauri-pipe", () => ({
  setPipeStage: vi.fn(),
}));

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

  it("formate l'affichage RDV planifié", () => {
    expect(formatRdvEntryDisplayLabel({ entry_type: "RDV", titre: "R2" })).toBe("R2 planifié");
    expect(formatRdvEntryDisplayLabel({ entry_type: "RDV", titre: "R1" })).toBe("R1 planifié");
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

  it("considère le RDV terminé après la fin du créneau (1 h)", () => {
    const start = Math.floor(new Date(2026, 6, 15, 8, 0).getTime() / 1000);
    const during = new Date(2026, 6, 15, 8, 30);
    const after = new Date(2026, 6, 15, 9, 30);
    expect(isRdvTimelineEntryCompleted(mkRdv(1, "R1", start), during)).toBe(false);
    expect(isRdvTimelineEntryCompleted(mkRdv(1, "R1", start), after)).toBe(true);
  });

  it("marque R1 complété dans le stepper si dernier RDV R1 terminé", () => {
    const start = Math.floor(new Date(2026, 6, 15, 8, 0).getTime() / 1000);
    const now = new Date(2026, 6, 15, 9, 30);
    expect(isPipeRdvStageCompleted("R1", [mkRdv(1, "R1", start)], now)).toBe(true);
  });

  it("ignore un RDV R1 reporté dans le futur", () => {
    const past = Math.floor(new Date(2026, 6, 10, 8, 0).getTime() / 1000);
    const future = Math.floor(new Date(2026, 6, 20, 8, 0).getTime() / 1000);
    const now = new Date(2026, 6, 15, 10, 0);
    expect(isPipeRdvStageCompleted("R1", [mkRdv(1, "R1", past), mkRdv(2, "R1", future)], now)).toBe(
      false
    );
  });
});

describe("applyRdvStageOnSave", () => {
  beforeEach(() => {
    vi.mocked(setPipeStage).mockReset();
    vi.mocked(setPipeStage).mockResolvedValue({
      id: 1,
      contact_id: 1,
      pipe_type: "AFFAIRE",
      titre: "Test",
      stage: "R1",
      created_at: 1,
      updated_at: 2,
    });
  });

  it("n'avance pas si RDV futur", async () => {
    const future = Math.floor(new Date(2026, 6, 20, 15, 0).getTime() / 1000);
    const result = await applyRdvStageOnSave({
      pipe: { id: 1, stage: "PROSPECTION", pipe_type: "AFFAIRE" },
      rdvStage: "R1",
      occurredAt: future,
    });
    expect(result.advanced).toBe(false);
    expect(result.scheduledDateLabel).toBeTruthy();
    expect(setPipeStage).not.toHaveBeenCalled();
  });

  it("avance en R1 si RDV échu et prospection", async () => {
    const past = Math.floor(new Date(2026, 6, 10, 15, 0).getTime() / 1000);
    const result = await applyRdvStageOnSave({
      pipe: { id: 1, stage: "PROSPECTION", pipe_type: "AFFAIRE" },
      rdvStage: "R1",
      occurredAt: past,
      notes: "  CR ok  ",
    });
    expect(result.advanced).toBe(true);
    expect(setPipeStage).toHaveBeenCalledWith(1, "R1", {
      notes: "CR ok",
      milestoneOccurredAt: past,
    });
  });

  it("n'avance pas si stage déjà au-delà", async () => {
    const past = Math.floor(new Date(2026, 6, 10, 15, 0).getTime() / 1000);
    const result = await applyRdvStageOnSave({
      pipe: { id: 1, stage: "R2", pipe_type: "AFFAIRE" },
      rdvStage: "R1",
      occurredAt: past,
    });
    expect(result.advanced).toBe(false);
    expect(setPipeStage).not.toHaveBeenCalled();
  });
});

describe("applyDueRdvStageAdvance", () => {
  beforeEach(() => {
    vi.mocked(setPipeStage).mockReset();
    vi.mocked(setPipeStage).mockResolvedValue({
      id: 1,
      contact_id: 1,
      pipe_type: "AFFAIRE",
      titre: "Test",
      stage: "R1",
      created_at: 1,
      updated_at: 2,
    });
  });

  it("appelle setPipeStage pour RDV échu", async () => {
    const ts = Math.floor(new Date(2026, 6, 10, 15, 0).getTime() / 1000);
    await applyDueRdvStageAdvance(
      { id: 1, stage: "PROSPECTION", pipe_type: "AFFAIRE" },
      [mkRdv(1, "R1", ts)]
    );
    expect(setPipeStage).toHaveBeenCalledWith(1, "R1", {
      notes: "CR test",
      milestoneOccurredAt: ts,
    });
  });
});
