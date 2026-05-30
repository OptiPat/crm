import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchAppNotificationsSummary } from "@/lib/notifications/app-notifications";

vi.mock("@/lib/api/tauri-alertes", () => ({
  getAlertesNonTraitees: vi.fn(),
}));

vi.mock("@/lib/api/tauri-etiquettes", () => ({
  getEtiquetteEmailQueue: vi.fn(),
}));

import { getAlertesNonTraitees } from "@/lib/api/tauri-alertes";
import { getEtiquetteEmailQueue } from "@/lib/api/tauri-etiquettes";

describe("fetchAppNotificationsSummary", () => {
  beforeEach(() => {
    vi.mocked(getAlertesNonTraitees).mockReset();
    vi.mocked(getEtiquetteEmailQueue).mockReset();
  });

  it("agrège les files email et alertes", async () => {
    vi.mocked(getAlertesNonTraitees).mockResolvedValue([{ id: 1 }] as never);
    vi.mocked(getEtiquetteEmailQueue).mockImplementation(async (status) => {
      if (status === "ready") return [{ contact_id: 1 }] as never;
      if (status === "followup") return [{ contact_id: 2 }, { contact_id: 3 }] as never;
      return [];
    });

    const summary = await fetchAppNotificationsSummary();
    expect(summary.items).toHaveLength(3);
    expect(summary.totalCount).toBe(4);
    expect(summary.items.find((i) => i.id === "emails_ready")?.count).toBe(1);
    expect(summary.items.find((i) => i.id === "emails_followup")?.count).toBe(2);
  });

  it("retourne vide si rien en attente", async () => {
    vi.mocked(getAlertesNonTraitees).mockResolvedValue([]);
    vi.mocked(getEtiquetteEmailQueue).mockResolvedValue([]);
    const summary = await fetchAppNotificationsSummary();
    expect(summary.items).toHaveLength(0);
    expect(summary.totalCount).toBe(0);
  });
});
