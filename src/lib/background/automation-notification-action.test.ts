import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleAutomationNotificationAction } from "@/lib/background/automation-notification-action";
import { persistPendingAutomationNav } from "@/lib/background/automation-notification-pending";
import { applyAutomationNotificationTarget } from "@/lib/background/automation-notification-nav";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/background/automation-notification-pending", () => ({
  persistPendingAutomationNav: vi.fn(),
  clearPendingAutomationNavLocal: vi.fn(),
}));

vi.mock("@/lib/background/automation-notification-nav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/background/automation-notification-nav")>();
  return {
    ...actual,
    applyAutomationNotificationTarget: vi.fn(),
  };
});

describe("handleAutomationNotificationAction", () => {
  beforeEach(() => {
    vi.mocked(persistPendingAutomationNav).mockReset();
    vi.mocked(applyAutomationNotificationTarget).mockReset();
  });

  it("met la nav en attente si non authentifié", () => {
    const setPage = vi.fn();
    handleAutomationNotificationAction(
      { nav: '{"page":"agenda"}' },
      setPage,
      { authenticated: false, skipFocus: true }
    );
    expect(persistPendingAutomationNav).toHaveBeenCalledWith('{"page":"agenda"}');
    expect(applyAutomationNotificationTarget).not.toHaveBeenCalled();
  });

  it("navigue immédiatement si authentifié", () => {
    const setPage = vi.fn();
    handleAutomationNotificationAction(
      { nav: '{"page":"pipe"}' },
      setPage,
      { authenticated: true, skipFocus: true }
    );
    expect(applyAutomationNotificationTarget).toHaveBeenCalledWith({ page: "pipe" }, setPage);
  });
});
