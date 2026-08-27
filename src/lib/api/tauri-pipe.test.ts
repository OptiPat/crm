import { describe, expect, it, vi, beforeEach } from "vitest";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe("tauri-pipe", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue([]);
  });

  it("listPipes transmet includeArchived en camelCase (Tauri)", async () => {
    const { listPipes } = await import("./tauri-pipe");
    await listPipes(false);
    expect(invoke).toHaveBeenCalledWith("list_pipes", { includeArchived: false });
    await listPipes(true);
    expect(invoke).toHaveBeenCalledWith("list_pipes", { includeArchived: true });
  });

  it("setPipeEtudeRealisee transmet etudeRealisee en camelCase (Tauri)", async () => {
    const { setPipeEtudeRealisee } = await import("./tauri-pipe");
    invoke.mockResolvedValue({ id: 1, etude_realisee: true });
    await setPipeEtudeRealisee(1, true);
    expect(invoke).toHaveBeenCalledWith("set_pipe_etude_realisee", {
      id: 1,
      etudeRealisee: true,
    });
  });
});
