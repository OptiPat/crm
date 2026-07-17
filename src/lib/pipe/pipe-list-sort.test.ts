import { describe, expect, it } from "vitest";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PlacementPipeOpenCount } from "@/lib/api/tauri-box-placement";
import { buildSuiviPlacementColumnByPipe } from "@/lib/pipe/pipe-list-badges";
import { sortPipesForList } from "@/lib/pipe/pipe-list-sort";

function pipe(overrides: Partial<PipeRecord> & Pick<PipeRecord, "id" | "titre">): PipeRecord {
  return {
    contact_id: 1,
    contact_prenom: "Jean",
    contact_nom: "DUPONT",
    secondary_contact_id: null,
    secondary_contact_prenom: null,
    secondary_contact_nom: null,
    pipe_type: "AFFAIRE",
    parent_pipe_id: null,
    parent_titre: null,
    stage: "R2",
    notes: null,
    created_at: 1,
    updated_at: 2,
    ...overrides,
  };
}

describe("sortPipesForList", () => {
  const rows = [
    pipe({ id: 1, titre: "Zebra", stage: "R3", updated_at: 10 }),
    pipe({ id: 2, titre: "Alpha", stage: "PROSPECTION", updated_at: 30 }),
    pipe({ id: 3, titre: "Beta", stage: "R1", updated_at: 20 }),
  ];

  it("trie par date de modification", () => {
    expect(
      sortPipesForList(rows, "updated_desc", { columnByPipe: {}, countsByPipe: {} }).map(
        (p) => p.id
      )
    ).toEqual([2, 3, 1]);

    expect(
      sortPipesForList(rows, "updated_asc", { columnByPipe: {}, countsByPipe: {} }).map(
        (p) => p.id
      )
    ).toEqual([1, 3, 2]);
  });

  it("trie par titre", () => {
    expect(
      sortPipesForList(rows, "titre_asc", { columnByPipe: {}, countsByPipe: {} }).map(
        (p) => p.id
      )
    ).toEqual([2, 3, 1]);
  });

  it("trie les affaires par avancement", () => {
    expect(
      sortPipesForList(rows, "avancement_asc", { columnByPipe: {}, countsByPipe: {} }).map(
        (p) => p.stage
      )
    ).toEqual(["PROSPECTION", "R1", "R3"]);

    expect(
      sortPipesForList(rows, "avancement_desc", { columnByPipe: {}, countsByPipe: {} }).map(
        (p) => p.stage
      )
    ).toEqual(["R3", "R1", "PROSPECTION"]);
  });

  it("trie les suivis par colonne kanban", () => {
    const suivis = [
      pipe({
        id: 10,
        titre: "Suivi C",
        pipe_type: "ACTE_GESTION",
        stage: "",
        updated_at: 1,
      }),
      pipe({
        id: 11,
        titre: "Suivi A",
        pipe_type: "ACTE_GESTION",
        stage: "",
        updated_at: 2,
      }),
      pipe({
        id: 12,
        titre: "Suivi B",
        pipe_type: "ACTE_GESTION",
        stage: "",
        updated_at: 3,
      }),
    ];
    const columnByPipe = buildSuiviPlacementColumnByPipe([
      {
        operation: {
          id: 1,
          contact_id: 1,
          operation_type: "ARBITRAGE",
          status: "PENDING",
          created_at: 1,
          updated_at: 1,
          pipe_id: 10,
          pipe_timeline_entry_id: 1,
        },
        contact_nom: "DUPONT",
        contact_prenom: "Jean",
        pipe_titre: "Suivi C",
      },
      {
        operation: {
          id: 2,
          contact_id: 1,
          operation_type: "ARBITRAGE",
          status: "CONFORME",
          created_at: 1,
          updated_at: 2,
          pipe_id: 12,
          pipe_timeline_entry_id: 2,
          email_received_at: 100,
        },
        contact_nom: "DUPONT",
        contact_prenom: "Jean",
        pipe_titre: "Suivi B",
      },
    ]);
    const countsByPipe: Record<number, PlacementPipeOpenCount> = {};

    expect(
      sortPipesForList(suivis, "avancement_asc", { columnByPipe, countsByPipe }).map(
        (p) => p.id
      )
    ).toEqual([11, 10, 12]);
  });

  it("mélange affaires et suivis par avancement unifié (sans regroupement par type)", () => {
    const mixed = [
      pipe({ id: 1, titre: "Affaire R3", stage: "R3" }),
      pipe({
        id: 2,
        titre: "Suivi attente",
        pipe_type: "ACTE_GESTION",
        stage: "",
      }),
      pipe({ id: 3, titre: "Affaire prospection", stage: "PROSPECTION" }),
      pipe({ id: 4, titre: "Action ponctuelle", pipe_type: "ACTION", stage: "" }),
    ];
    const columnByPipe = {
      2: { column: "waiting" as const, count: 1 },
    };

    expect(
      sortPipesForList(mixed, "avancement_asc", { columnByPipe, countsByPipe: {} }).map(
        (p) => p.id
      )
    ).toEqual([3, 2, 1, 4]);
  });
});
