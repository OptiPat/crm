import { describe, expect, it } from "vitest";
import { buildAppNotificationsSummary } from "@/lib/notifications/app-notifications";

describe("buildAppNotificationsSummary", () => {
  it("agrège les files email et alertes", () => {
    const summary = buildAppNotificationsSummary({
      ready: { count: 1, focus_contact_id: 1 },
      followup: { count: 2 },
      incomplete: { count: 0 },
      sent: { count: 0 },
      alertes: { count: 1, focus_contact_id: 9 },
      taches_urgent: { count: 3 },
      stellium_signals: [],
    });

    expect(summary.items).toHaveLength(4);
    expect(summary.totalCount).toBe(7);
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
      stellium_signals: [],
    });
    expect(summary.items).toHaveLength(0);
    expect(summary.totalCount).toBe(0);
  });
});
