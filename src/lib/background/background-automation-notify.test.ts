import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  notifyAutomationEvent,
  resetAutomationNotifyStateForTests,
} from "@/lib/background/background-automation-notify";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn(),
  registerActionTypes: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), warning: vi.fn() },
}));

import { invoke } from "@tauri-apps/api/core";
import { sendNotification } from "@tauri-apps/plugin-notification";

describe("background-automation-notify", () => {
  beforeEach(() => {
    resetAutomationNotifyStateForTests();
    vi.mocked(invoke).mockReset();
    vi.mocked(sendNotification).mockReset();
    Object.defineProperty(navigator, "userAgent", {
      value: "Windows NT 10.0",
      configurable: true,
    });
  });

  it("notifyAutomationEvent tray Windows appelle WinRT avant le plugin", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    const ok = await notifyAutomationEvent("Titre", "Corps", {
      tray: true,
      nav: { page: "pipe" },
    });

    expect(ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith("send_automation_desktop_toast_cmd", {
      title: "Titre",
      body: "Corps",
      navJson: '{"page":"pipe"}',
    });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("notifyAutomationEvent tray Windows retombe sur le plugin si WinRT échoue", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("WinRT down"));

    const ok = await notifyAutomationEvent("Titre", "Corps", {
      tray: true,
      nav: { page: "dashboard" },
    });

    expect(ok).toBe(true);
    expect(sendNotification).toHaveBeenCalled();
  });
});
