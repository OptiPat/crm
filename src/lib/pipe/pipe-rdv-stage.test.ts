import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

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
    expect(rdvStageFromEntryTitre("R2 Placement")).toBe("R2");
    expect(rdvStageFromEntryTitre("R2 Immo")).toBe("R2");
    expect(rdvStageFromEntryTitre("R3 Placements")).toBe("R3");
    expect(rdvStageFromEntryTitre("R3 Immo")).toBe("R3");
    expect(rdvStageFromEntryTitre("Appel")).toBeNull();
  });

  it("formate l'affichage RDV planifié", () => {
    expect(formatRdvEntryDisplayLabel({ entry_type: "RDV", titre: "R2" })).toBe("R2 planifié");
    expect(formatRdvEntryDisplayLabel({ entry_type: "RDV", titre: "R2 Placement" })).toBe(
      "R2 Placement planifié"
    );
    expect(formatRdvEntryDisplayLabel({ entry_type: "RDV", titre: "R1" })).toBe("R1 planifié");
  });

  it("considère échu à partir du jour calendaire du RDV", () => {
    const noonToday = Math.floor(new Date(2026, 6, 11, 12, 0).getTime() / 1000);
    const now = new Date(2026, 6, 11, 8, 0);
    expect(isRdvStageAdvanceDue(noonToday, now)).toBe(true);

    const future = Math.floor(new Date(2026, 6, 20, 10, 0).getTime() / 1000);
    expect(isRdvStageAdvanceDue(future, now)).toBe(false);
  });

  it("propose R1 si prospection et RDV R1 déjà passé", () => {
    const ts = Math.floor(new Date(2026, 6, 10, 15, 0).getTime() / 1000);
    const target = pickDueRdvStageAdvanceTarget("PROSPECTION", [mkRdv(1, "R1", ts)]);
    expect(target?.stage).toBe("R1");
    expect(target?.column).toBe("R1_REALISE");
  });

  it("avance aussi pour un RDV futur", () => {
    const ts = Math.floor(new Date(2026, 6, 20, 15, 0).getTime() / 1000);
    const target = pickDueRdvStageAdvanceTarget("PROSPECTION", [mkRdv(1, "R1", ts)]);
    expect(target?.stage).toBe("R1");
    expect(target?.column).toBe("R1_POSITIONNE");
  });

  it("ne saute pas un rang manquant (R2 annulé, R3 encore posé)", () => {
    const pastR1 = Math.floor(new Date(2026, 6, 14, 8, 0).getTime() / 1000);
    const futureR3 = Math.floor(new Date(2026, 7, 1, 10, 0).getTime() / 1000);
    const target = pickDueRdvStageAdvanceTarget("R3", [
      mkRdv(1, "R1", pastR1),
      {
        id: 2,
        pipe_id: 1,
        entry_type: "NOTE",
        titre: null,
        contenu: "R2 Placement planifié annulé",
        occurred_at: pastR1 + 10,
        created_at: pastR1 + 10,
      },
      mkRdv(3, "R3 Immo", futureR3),
    ]);
    expect(target?.stage).toBe("R1");
    expect(target?.column).toBe("R1_REALISE");
  });

  it("considère le RDV R1 terminé après 1 h 30 (pas 1 h)", () => {
    const start = Math.floor(new Date(2026, 6, 15, 8, 0).getTime() / 1000);
    const during = new Date(2026, 6, 15, 9, 10);
    const after = new Date(2026, 6, 15, 9, 35);
    expect(isRdvTimelineEntryCompleted(mkRdv(1, "R1", start), during)).toBe(false);
    expect(isRdvTimelineEntryCompleted(mkRdv(1, "R1", start), after)).toBe(true);
  });

  it("considère le R2 Placement terminé après 1 h", () => {
    const start = Math.floor(new Date(2026, 6, 15, 8, 0).getTime() / 1000);
    const during = new Date(2026, 6, 15, 8, 30);
    const after = new Date(2026, 6, 15, 9, 5);
    expect(isRdvTimelineEntryCompleted(mkRdv(1, "R2 Placement", start), during)).toBe(false);
    expect(isRdvTimelineEntryCompleted(mkRdv(1, "R2 Placement", start), after)).toBe(true);
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

  it("avance en R1 dès que le RDV est pris, même futur", async () => {
    const future = Math.floor(new Date(2026, 6, 20, 15, 0).getTime() / 1000);
    const result = await applyRdvStageOnSave({
      pipe: { id: 1, stage: "PROSPECTION", pipe_type: "AFFAIRE" },
      rdvStage: "R1",
      occurredAt: future,
      entries: [mkRdv(1, "R1", future)],
    });
    expect(result.advanced).toBe(true);
    expect(result.boardColumn).toBe("R1_POSITIONNE");
    expect(result.scheduledDateLabel).toBeTruthy();
    expect(setPipeStage).toHaveBeenCalledWith(1, "R1", {
      notes: null,
      milestoneOccurredAt: future,
    });
  });

  it("avance en R1 si RDV échu et prospection", async () => {
    const past = Math.floor(new Date(2026, 6, 10, 15, 0).getTime() / 1000);
    const result = await applyRdvStageOnSave({
      pipe: { id: 1, stage: "PROSPECTION", pipe_type: "AFFAIRE" },
      rdvStage: "R1",
      occurredAt: past,
      notes: "  CR ok  ",
      entries: [mkRdv(1, "R1", past)],
    });
    expect(result.advanced).toBe(true);
    expect(setPipeStage).toHaveBeenCalledWith(1, "R1", {
      notes: "CR ok",
      milestoneOccurredAt: past,
    });
  });

  it("n'écrit pas R2 tant que le R1 n'est pas fini", async () => {
    const currentR1 = Math.floor(new Date(2026, 6, 15, 9, 30).getTime() / 1000);
    const futureR2 = Math.floor(new Date(2026, 7, 1, 10, 0).getTime() / 1000);
    const result = await applyRdvStageOnSave({
      pipe: { id: 1, stage: "R1", pipe_type: "AFFAIRE" },
      rdvStage: "R2",
      occurredAt: futureR2,
      entries: [mkRdv(1, "R1", currentR1), mkRdv(2, "R2 Placement", futureR2)],
    });
    expect(result.advanced).toBe(false);
    expect(result.boardColumn).toBe("R1_POSITIONNE");
    expect(setPipeStage).not.toHaveBeenCalled();
  });

  it("aligne le stage persisté sur la colonne si le RDV le plus haut n'est plus le rang affiché", async () => {
    const pastR1 = Math.floor(new Date(2026, 6, 14, 8, 0).getTime() / 1000);
    const futureR3 = Math.floor(new Date(2026, 7, 1, 10, 0).getTime() / 1000);
    const result = await applyRdvStageOnSave({
      pipe: { id: 1, stage: "R3", pipe_type: "AFFAIRE" },
      rdvStage: "R3",
      occurredAt: futureR3,
      entries: [
        mkRdv(1, "R1", pastR1),
        {
          id: 2,
          pipe_id: 1,
          entry_type: "NOTE",
          titre: null,
          contenu: "R2 Placement planifié annulé",
          occurred_at: pastR1 + 10,
          created_at: pastR1 + 10,
        },
        mkRdv(3, "R3 Immo", futureR3),
      ],
    });
    expect(result.boardColumn).toBe("R1_REALISE");
    expect(result.advanced).toBe(true);
    expect(setPipeStage).toHaveBeenCalledWith(1, "R1", expect.any(Object));
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
