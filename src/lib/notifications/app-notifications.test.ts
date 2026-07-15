import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_NOTIFICATIONS_CACHE_TTL_MS,
  buildAppNotificationsSummary,
  fetchAppNotificationsSummary,
  invalidateAppNotificationsSummaryCache,
} from "@/lib/notifications/app-notifications";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const emptyDto = {
  ready: { count: 0 },
  followup: { count: 0 },
  incomplete: { count: 0 },
  sent: { count: 0 },
  alertes: { count: 0 },
  taches_urgent: { count: 0 },
  placement_non_conforme: { count: 0 },
  stellium_signals: [] as [],
};

const alertDto = {
  ...emptyDto,
  alertes: { count: 2, focus_contact_id: null },
};

describe("buildAppNotificationsSummary", () => {
  it("agrège les files email et alertes", () => {
    const summary = buildAppNotificationsSummary({
      ready: { count: 1, focus_contact_id: 1 },
      followup: { count: 2 },
      incomplete: { count: 0 },
      sent: { count: 0 },
      alertes: { count: 1, focus_contact_id: 9 },
      taches_urgent: { count: 3 },
      placement_non_conforme: { count: 2, focus_contact_id: null },
      stellium_signals: [],
    });

    expect(summary.items).toHaveLength(5);
    expect(summary.totalCount).toBe(9);
    expect(summary.items.find((i) => i.id === "placement_non_conforme")).toMatchObject({
      label: "Opérations partenaire non conformes",
      count: 2,
      suiviTab: "alertes",
      severity: "urgent",
    });
    expect(summary.items.find((i) => i.id === "taches_urgent")).toMatchObject({
      label: "Aujourd'hui / en retard",
      count: 3,
      targetPage: "taches",
    });
    expect(summary.items.find((i) => i.id === "emails_ready")?.focusContactId).toBe(1);
    expect(
      summary.items.find((i) => i.id === "emails_followup")?.focusContactId
    ).toBeUndefined();
  });

  it("retourne vide si rien en attente", () => {
    const summary = buildAppNotificationsSummary({
      ready: { count: 0 },
      followup: { count: 0 },
      incomplete: { count: 0 },
      sent: { count: 0 },
      alertes: { count: 0 },
      taches_urgent: { count: 0 },
      placement_non_conforme: { count: 0 },
      stellium_signals: [],
    });
    expect(summary.items).toHaveLength(0);
    expect(summary.totalCount).toBe(0);
  });
});

describe("fetchAppNotificationsSummary cache", () => {
  beforeEach(() => {
    invalidateAppNotificationsSummaryCache();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(alertDto);
  });

  afterEach(() => {
    vi.useRealTimers();
    invalidateAppNotificationsSummaryCache();
  });

  it("réutilise le cache pendant la fenêtre TTL", async () => {
    await fetchAppNotificationsSummary();
    await fetchAppNotificationsSummary();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("force=true contourne le cache", async () => {
    await fetchAppNotificationsSummary();
    await fetchAppNotificationsSummary({ force: true });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("refetch après expiration du TTL", async () => {
    vi.useFakeTimers();
    await fetchAppNotificationsSummary();
    vi.advanceTimersByTime(APP_NOTIFICATIONS_CACHE_TTL_MS + 1);
    await fetchAppNotificationsSummary();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("force=true relance un fetch même si un invoke est en cours", async () => {
    let resolveFirst!: (value: typeof alertDto) => void;
    const firstHang = new Promise<typeof alertDto>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(invoke).mockReturnValueOnce(firstHang).mockResolvedValueOnce(emptyDto);

    const first = fetchAppNotificationsSummary();
    const forced = fetchAppNotificationsSummary({ force: true });
    resolveFirst(alertDto);
    await first;
    await forced;
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
