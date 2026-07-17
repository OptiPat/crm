import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  loadPipeSection,
  PIPE_SECTION_KEY,
  savePipeSection,
  pipeSectionIsListe,
  pipeSectionNeedsPlacementBoard,
} from "./pipe-section";
import { PIPE_BOARD_TAB_KEY, PIPE_VIEW_MODE_KEY } from "./pipe-board-utils";

describe("pipe-section", () => {
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

  it("persiste la section et synchronise les cles legacy", () => {
    savePipeSection("suivi_stellium");
    expect(storage.get(PIPE_SECTION_KEY)).toBe("suivi_stellium");
    expect(storage.get(PIPE_VIEW_MODE_KEY)).toBe("board");
    expect(storage.get(PIPE_BOARD_TAB_KEY)).toBe("actes");

    savePipeSection("liste");
    expect(storage.get(PIPE_SECTION_KEY)).toBe("liste");
    expect(storage.get(PIPE_VIEW_MODE_KEY)).toBe("list");
    expect(storage.get(PIPE_BOARD_TAB_KEY)).toBe("affaires");
  });

  it("migre viewMode list vers liste", () => {
    storage.set(PIPE_VIEW_MODE_KEY, "list");
    storage.set(PIPE_BOARD_TAB_KEY, "affaires");
    expect(loadPipeSection()).toBe("liste");
  });

  it("migre boardTab actes vers suivi_stellium", () => {
    storage.set(PIPE_VIEW_MODE_KEY, "board");
    storage.set(PIPE_BOARD_TAB_KEY, "actes");
    expect(loadPipeSection()).toBe("suivi_stellium");
  });

  it("detecte liste et besoin placement board", () => {
    expect(pipeSectionIsListe("liste")).toBe(true);
    expect(pipeSectionIsListe("affaires")).toBe(false);
    expect(pipeSectionNeedsPlacementBoard("suivi_stellium")).toBe(true);
    expect(pipeSectionNeedsPlacementBoard("liste")).toBe(true);
    expect(pipeSectionNeedsPlacementBoard("affaires")).toBe(false);
  });
});
