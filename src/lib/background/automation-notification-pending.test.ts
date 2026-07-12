import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  clearPendingAutomationNavLocal,
  consumePendingAutomationNotificationNav,
  persistPendingAutomationNav,
  resetPendingAutomationNavForTests,
} from "@/lib/background/automation-notification-pending";
import { applyAutomationNotificationTarget } from "@/lib/background/automation-notification-nav";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/lib/background/automation-notification-nav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/background/automation-notification-nav")>();
  return {
    ...actual,
    applyAutomationNotificationTarget: vi.fn(),
  };
});

import { invoke } from "@tauri-apps/api/core";

describe("automation-notification-pending", () => {
  beforeEach(() => {
    resetPendingAutomationNavForTests();
    vi.mocked(invoke).mockReset();
    vi.mocked(applyAutomationNotificationTarget).mockReset();
  });

  it("persistPendingAutomationNav stocke la nav en localStorage", () => {
    persistPendingAutomationNav('{"page":"agenda"}');
    expect(localStorage.getItem("crm_pending_automation_nav")).toContain("agenda");
  });

  it("consumePendingAutomationNotificationNav préfère Rust puis localStorage", async () => {
    persistPendingAutomationNav('{"page":"pipe"}');
    vi.mocked(invoke).mockResolvedValue('{"page":"suivi","tab":"alertes"}');

    const setPage = vi.fn();
    const applied = await consumePendingAutomationNotificationNav(setPage);

    expect(applied).toBe(true);
    expect(invoke).toHaveBeenCalledWith("take_pending_automation_notification_nav_cmd");
    expect(applyAutomationNotificationTarget).toHaveBeenCalledWith(
      { page: "suivi", tab: "alertes" },
      setPage
    );
    expect(localStorage.getItem("crm_pending_automation_nav")).toBeNull();
  });

  it("consumePendingAutomationNotificationNav retourne false si rien en attente", async () => {
    vi.mocked(invoke).mockResolvedValue(null);
    const setPage = vi.fn();
    expect(await consumePendingAutomationNotificationNav(setPage)).toBe(false);
    clearPendingAutomationNavLocal();
  });
});
