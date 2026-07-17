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
});
