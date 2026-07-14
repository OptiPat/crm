import { describe, expect, it, vi, beforeEach } from "vitest";
import { isCrmWindowHidden, isCrmWindowVisible } from "@/lib/background/crm-window-visibility";

const isVisibleMock = vi.fn();

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    isVisible: isVisibleMock,
  }),
}));

describe("crm-window-visibility", () => {
  beforeEach(() => {
    isVisibleMock.mockReset();
  });

  it("isCrmWindowHidden quand isVisible est false", async () => {
    isVisibleMock.mockResolvedValue(false);
    await expect(isCrmWindowHidden()).resolves.toBe(true);
    await expect(isCrmWindowVisible()).resolves.toBe(false);
  });

  it("isCrmWindowVisible quand isVisible est true", async () => {
    isVisibleMock.mockResolvedValue(true);
    await expect(isCrmWindowHidden()).resolves.toBe(false);
    await expect(isCrmWindowVisible()).resolves.toBe(true);
  });
});
