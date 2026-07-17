import { describe, expect, it } from "vitest";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PlacementPipeOpenCount } from "@/lib/api/tauri-box-placement";
import {
  coercePipeListStageForPipeType,
  DEFAULT_PIPE_LIST_FILTERS,
  filterPipesForList,
  hasActivePipeListFilters,
  pipeMatchesSuiviAdvancementFilter,
} from "@/lib/pipe/pipe-list-filters";

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

describe("pipe-list-filters", () => {
  const rows = [
    pipe({ id: 1, titre: "Affaire Dupont", stage: "R2" }),
    pipe({
      id: 2,
      titre: "Acte gestion",
      pipe_type: "ACTE_GESTION",
      stage: "",
      contact_prenom: "Paul",
      contact_nom: "BERNARD",
    }),
    pipe({ id: 3, titre: "SCPI Corum", stage: "PROSPECTION", contact_nom: "MARTIN" }),
  ];

  it("filtre par recherche, type et stage", () => {
    expect(
      filterPipesForList(rows, {
        ...DEFAULT_PIPE_LIST_FILTERS,
        search: "dupont",
      })
    ).toHaveLength(1);

    expect(
      filterPipesForList(rows, {
        ...DEFAULT_PIPE_LIST_FILTERS,
        pipeType: "ACTE_GESTION",
      })
    ).toHaveLength(1);

    expect(
      filterPipesForList(rows, {
        ...DEFAULT_PIPE_LIST_FILTERS,
        stage: "PROSPECTION",
      })
    ).toHaveLength(1);
  });

  it("détecte les filtres actifs", () => {
    expect(hasActivePipeListFilters(DEFAULT_PIPE_LIST_FILTERS)).toBe(false);
    expect(
      hasActivePipeListFilters({ ...DEFAULT_PIPE_LIST_FILTERS, search: "x" })
    ).toBe(true);
  });

  it("conserve les versements complémentaires dans la liste affaire", () => {
    const versement = pipe({
      id: 4,
      titre: "Versement complémentaire — Jean DUPONT",
      parent_pipe_id: 2,
      stage: "PROSPECTION",
    });
    expect(
      filterPipesForList([...rows, versement], {
        ...DEFAULT_PIPE_LIST_FILTERS,
        pipeType: "AFFAIRE",
      }).map((p) => p.id)
    ).toContain(4);
  });

  it("coerce le stage incohérent avec le type", () => {
    expect(coercePipeListStageForPipeType("ALL", "R2")).toBe("ALL");
    expect(coercePipeListStageForPipeType("AFFAIRE", "journal")).toBe("ALL");
    expect(coercePipeListStageForPipeType("ACTE_GESTION", "waiting")).toBe("waiting");
  });

  it("ignore le filtre suivi tant que le contexte placement n'est pas prêt", () => {
    const suivi = pipe({
      id: 10,
      titre: "Suivi test",
      pipe_type: "ACTE_GESTION",
      stage: "",
    });
    const context = {
      columnByPipe: {},
      countsByPipe: {} as Record<number, PlacementPipeOpenCount>,
      placementContextReady: false,
    };

    expect(
      filterPipesForList([suivi], { ...DEFAULT_PIPE_LIST_FILTERS, stage: "journal" }, context)
    ).toHaveLength(1);
  });

  it("filtre les suivis par avancement", () => {
    const suivi = pipe({
      id: 10,
      titre: "Suivi test",
      pipe_type: "ACTE_GESTION",
      stage: "",
    });
    const context = {
      columnByPipe: { 10: { column: "waiting" as const, count: 1 } },
      countsByPipe: {} as Record<number, PlacementPipeOpenCount>,
    };

    expect(
      filterPipesForList([suivi], { ...DEFAULT_PIPE_LIST_FILTERS, stage: "waiting" }, context)
    ).toHaveLength(1);
    expect(
      filterPipesForList([suivi], { ...DEFAULT_PIPE_LIST_FILTERS, stage: "journal" }, context)
    ).toHaveLength(0);
    expect(
      pipeMatchesSuiviAdvancementFilter(suivi, "pending", {
        columnByPipe: {},
        countsByPipe: { 10: { pipe_id: 10, unsent: 0, pending: 2, non_conforme: 0 } },
      })
    ).toBe(true);
  });
});
