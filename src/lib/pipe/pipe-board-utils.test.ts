import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  filterAffairesForBoard,
  groupAffairesByStage,
  loadPipeBoardTab,
  savePipeBoardTab,
} from "./pipe-board-utils";
import type { PipeRecord } from "@/lib/api/tauri-pipe";

function affaire(id: number, stage: string, updated_at: number): PipeRecord {
  return {
    id,
    contact_id: 1,
    pipe_type: "AFFAIRE",
    titre: `Affaire ${id}`,
    stage,
    created_at: 1,
    updated_at,
    contact_nom: "DUPONT",
    contact_prenom: "Jean",
  };
}

describe("pipe-board-utils", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
  });

  it("filtre les affaires avec stage valide", () => {
    const pipes = [
      affaire(1, "R1", 10),
      { ...affaire(2, "R2", 20), pipe_type: "ACTION", stage: "" },
      { ...affaire(3, "BAD", 30) },
    ];
    expect(filterAffairesForBoard(pipes).map((p) => p.id)).toEqual([1]);
  });

  it("regroupe par stage et trie par updated_at desc", () => {
    const groups = groupAffairesByStage([
      affaire(1, "R1", 100),
      affaire(2, "R1", 200),
      affaire(3, "R2", 50),
    ]);
    expect(groups.R1.map((p) => p.id)).toEqual([2, 1]);
    expect(groups.R2.map((p) => p.id)).toEqual([3]);
    expect(groups.PROSPECTION).toEqual([]);
  });

  it("persiste l'onglet tableau affaires / actes", () => {
    savePipeBoardTab("actes");
    expect(loadPipeBoardTab()).toBe("actes");
    savePipeBoardTab("affaires");
    expect(loadPipeBoardTab()).toBe("affaires");
  });
});
