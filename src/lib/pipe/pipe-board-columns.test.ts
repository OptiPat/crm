import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  commercialRankFloor,
  groupAffairesByBoardColumn,
  PIPE_BOARD_COLUMNS,
  PIPE_BOARD_FUNNEL_COLUMNS,
  PIPE_BOARD_OUTCOME_COLUMNS,
  resolveAffaireBoardColumn,
} from "@/lib/pipe/pipe-board-columns";
import type { PipeRecord } from "@/lib/api/tauri-pipe";

const mkRdv = (
  id: number,
  titre: string,
  occurredAt: number,
  pipeId = 1
): PipeTimelineEntryRecord => ({
  id,
  pipe_id: pipeId,
  entry_type: "RDV",
  titre,
  contenu: null,
  occurred_at: occurredAt,
  created_at: occurredAt,
});

function pipe(stage: string): Pick<PipeRecord, "stage" | "pipe_type"> {
  return { stage, pipe_type: "AFFAIRE" };
}

describe("resolveAffaireBoardColumn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 10, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const now = () => new Date(2026, 6, 15, 10, 0);
  const pastR1 = Math.floor(new Date(2026, 6, 14, 8, 0).getTime() / 1000);
  const currentR1 = Math.floor(new Date(2026, 6, 15, 9, 30).getTime() / 1000);
  const futureR1 = Math.floor(new Date(2026, 6, 20, 10, 0).getTime() / 1000);
  const futureR2 = Math.floor(new Date(2026, 7, 1, 10, 0).getTime() / 1000);
  const pastR2 = Math.floor(new Date(2026, 6, 10, 8, 0).getTime() / 1000);
  const pastR3 = Math.floor(new Date(2026, 6, 8, 8, 0).getTime() / 1000);

  it("reste en prospection sans RDV", () => {
    expect(resolveAffaireBoardColumn(pipe("PROSPECTION"), [], now())).toBe("PROSPECTION");
    expect(resolveAffaireBoardColumn(pipe("R1"), [], now())).toBe("PROSPECTION");
  });

  it("passe en R1 positionné dès que la date est prise, même future", () => {
    expect(
      resolveAffaireBoardColumn(pipe("PROSPECTION"), [mkRdv(1, "R1", futureR1)], now())
    ).toBe("R1_POSITIONNE");
  });

  it("reste en R1 positionné pendant le créneau", () => {
    expect(
      resolveAffaireBoardColumn(pipe("R1"), [mkRdv(1, "R1", currentR1)], now())
    ).toBe("R1_POSITIONNE");
  });

  it("passe en R1 réalisé quand le R1 est fini et le R2 n'est pas posé", () => {
    expect(
      resolveAffaireBoardColumn(pipe("R1"), [mkRdv(1, "R1", pastR1)], now())
    ).toBe("R1_REALISE");
  });

  it("saute R1 réalisé si le R2 est déjà positionné", () => {
    expect(
      resolveAffaireBoardColumn(
        pipe("R1"),
        [mkRdv(1, "R1", pastR1), mkRdv(2, "R2 Placement", futureR2)],
        now()
      )
    ).toBe("R2_POSITIONNE");
  });

  it("reste en R1 positionné si R2 est posé avant la fin du R1", () => {
    expect(
      resolveAffaireBoardColumn(
        pipe("R2"),
        [mkRdv(1, "R1", currentR1), mkRdv(2, "R2", futureR2)],
        now()
      )
    ).toBe("R1_POSITIONNE");
  });

  it("passe en R2 réalisé puis R3 positionné selon le chaînage", () => {
    expect(
      resolveAffaireBoardColumn(pipe("R2"), [mkRdv(1, "R1", pastR1), mkRdv(2, "R2", pastR2)], now())
    ).toBe("R2_REALISE");
    expect(
      resolveAffaireBoardColumn(
        pipe("R2"),
        [mkRdv(1, "R1", pastR1), mkRdv(2, "R2", pastR2), mkRdv(3, "R3 Immo", futureR2)],
        now()
      )
    ).toBe("R3_POSITIONNE");
  });

  it("termine en R3 réalisé", () => {
    expect(
      resolveAffaireBoardColumn(
        pipe("R3"),
        [mkRdv(1, "R1", pastR1), mkRdv(2, "R2", pastR2), mkRdv(3, "R3", pastR3)],
        now()
      )
    ).toBe("R3_REALISE");
  });

  it("utilise le stage de création comme plancher sans RDV", () => {
    expect(resolveAffaireBoardColumn(pipe("R2"), [], now())).toBe("R1_REALISE");
    expect(resolveAffaireBoardColumn(pipe("R3"), [], now())).toBe("R2_REALISE");
  });

  it("conserve gagnée et perdue", () => {
    expect(resolveAffaireBoardColumn(pipe("GAGNEE"), [mkRdv(1, "R1", pastR1)], now())).toBe(
      "GAGNEE"
    );
    expect(resolveAffaireBoardColumn(pipe("PERDUE_OU_EN_ATTENTE"), [], now())).toBe(
      "PERDUE_OU_EN_ATTENTE"
    );
  });

  it("un R1 reporté dans le futur ramène en positionné", () => {
    expect(
      resolveAffaireBoardColumn(pipe("R1"), [mkRdv(1, "R1", pastR1), mkRdv(2, "R1", futureR1)], now())
    ).toBe("R1_POSITIONNE");
  });

  it("reste en R1 positionné 1 h 10 après le début (créneau 90 min)", () => {
    const start = Math.floor(new Date(2026, 6, 15, 9, 0).getTime() / 1000);
    expect(
      resolveAffaireBoardColumn(pipe("R1"), [mkRdv(1, "R1", start)], new Date(2026, 6, 15, 10, 10))
    ).toBe("R1_POSITIONNE");
  });

  it("ne saute pas R2 si le R2 est annulé alors que le R3 est encore posé", () => {
    expect(
      resolveAffaireBoardColumn(
        pipe("R3"),
        [
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
          mkRdv(3, "R3 Immo", futureR2),
        ],
        now()
      )
    ).toBe("R1_REALISE");
  });

  it("création R2 puis annulation du R2 : R1 réalisé, pas Prospection", () => {
    const birth = Math.floor(new Date(2026, 6, 1, 10, 0).getTime() / 1000);
    expect(
      resolveAffaireBoardColumn(
        pipe("R1"),
        [
          {
            id: 1,
            pipe_id: 1,
            entry_type: "CREATION",
            titre: "Affaire",
            contenu: null,
            occurred_at: birth,
            created_at: birth,
          },
          {
            id: 2,
            pipe_id: 1,
            entry_type: "AVANCEMENT",
            titre: "R2",
            contenu: null,
            occurred_at: birth,
            created_at: birth,
          },
          {
            id: 3,
            pipe_id: 1,
            entry_type: "NOTE",
            titre: null,
            contenu: "R2 planifié annulé",
            occurred_at: pastR2,
            created_at: pastR2,
          },
        ],
        now()
      )
    ).toBe("R1_REALISE");
  });
});

describe("commercialRankFloor", () => {
  it("mappe les stages persistés", () => {
    expect(commercialRankFloor("PROSPECTION")).toBe(0);
    expect(commercialRankFloor("R1")).toBe(1);
    expect(commercialRankFloor("R2")).toBe(2);
    expect(commercialRankFloor("R3")).toBe(3);
  });
});

describe("lignes du kanban", () => {
  it("place Gagnée et Perdue sous le funnel, sans perdre de colonne", () => {
    expect([...PIPE_BOARD_FUNNEL_COLUMNS, ...PIPE_BOARD_OUTCOME_COLUMNS]).toEqual([
      ...PIPE_BOARD_COLUMNS,
    ]);
  });
});

describe("groupAffairesByBoardColumn", () => {
  it("regroupe selon les RDV, pas seulement le stage persisté", () => {
    const future = Math.floor(new Date(2026, 6, 20, 10, 0).getTime() / 1000);
    const affaires: PipeRecord[] = [
      {
        id: 1,
        contact_id: 1,
        pipe_type: "AFFAIRE",
        titre: "A",
        stage: "PROSPECTION",
        created_at: 1,
        updated_at: 20,
      },
      {
        id: 2,
        contact_id: 1,
        pipe_type: "AFFAIRE",
        titre: "B",
        stage: "PROSPECTION",
        created_at: 1,
        updated_at: 10,
      },
    ];
    const groups = groupAffairesByBoardColumn(
      affaires,
      { 1: [mkRdv(1, "R1", future, 1)] },
      new Date(2026, 6, 15, 10, 0)
    );
    expect(groups.R1_POSITIONNE.map((p) => p.id)).toEqual([1]);
    expect(groups.PROSPECTION.map((p) => p.id)).toEqual([2]);
  });
});
