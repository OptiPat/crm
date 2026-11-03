import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  handleAutomationNotificationAction,
  handlePluginNotificationAction,
} from "@/lib/background/automation-notification-action";
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

describe("handlePluginNotificationAction", () => {
  beforeEach(() => {
    vi.mocked(applyAutomationNotificationTarget).mockReset();
  });

  it("lit la nav dans event.notification.extra (format plugin ≥ 2.6)", () => {
    const setPage = vi.fn();
    handlePluginNotificationAction(
      {
        notification: {
          id: 1,
          title: "Rappel",
          groupSummary: false,
          data: {},
          extra: { nav: '{"page":"agenda"}' },
          attachments: [],
        },
      },
      setPage,
      { authenticated: true, skipFocus: true }
    );
    expect(applyAutomationNotificationTarget).toHaveBeenCalledWith({ page: "agenda" }, setPage);
  });

  it("ouvre le tableau de bord si la plateforme ne transmet pas la notification", () => {
    const setPage = vi.fn();
    handlePluginNotificationAction({ notification: null }, setPage, {
      authenticated: true,
      skipFocus: true,
    });
    expect(applyAutomationNotificationTarget).toHaveBeenCalledWith({ page: "dashboard" }, setPage);
  });
});
