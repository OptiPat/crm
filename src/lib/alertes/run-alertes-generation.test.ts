import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALERTES_GENERATION_COOLDOWN_MS,
  resetAlertesGenerationCycleState,
  runAlertesGenerationCycle,
} from "@/lib/alertes/run-alertes-generation";
import * as tauriAlertes from "@/lib/api/tauri-alertes";
import * as alertEvents from "@/lib/alertes/alert-events";

vi.mock("@/lib/api/tauri-alertes", () => ({
  checkAndCreateDemembrementAlerts: vi.fn().mockResolvedValue([]),
  checkAndCreateArbitrageAlerts: vi.fn().mockResolvedValue([]),
  genererAlertesAutomatiques: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/alertes/alert-events", () => ({
  notifyAlertesChanged: vi.fn(),
}));

describe("runAlertesGenerationCycle", () => {
  afterEach(() => {
    resetAlertesGenerationCycleState();
    vi.clearAllMocks();
  });

  it("exécute les trois étapes puis notifie l'UI", async () => {
    await runAlertesGenerationCycle({ force: true });

    expect(tauriAlertes.checkAndCreateDemembrementAlerts).toHaveBeenCalledOnce();
    expect(tauriAlertes.checkAndCreateArbitrageAlerts).toHaveBeenCalledOnce();
    expect(tauriAlertes.genererAlertesAutomatiques).toHaveBeenCalledOnce();
    expect(alertEvents.notifyAlertesChanged).toHaveBeenCalledOnce();
  });

  it("respecte le cooldown sans force", async () => {
    await runAlertesGenerationCycle({ force: true });
    vi.clearAllMocks();

    await runAlertesGenerationCycle();

    expect(tauriAlertes.checkAndCreateDemembrementAlerts).not.toHaveBeenCalled();
  });

  it("dédoublonne les cycles concurrents", async () => {
    let resolveDemembrement!: () => void;
    vi.mocked(tauriAlertes.checkAndCreateDemembrementAlerts).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDemembrement = () => resolve([]);
        })
    );

    const first = runAlertesGenerationCycle({ force: true });
    const second = runAlertesGenerationCycle({ force: true });

    resolveDemembrement();
    await Promise.all([first, second]);

    expect(tauriAlertes.checkAndCreateDemembrementAlerts).toHaveBeenCalledOnce();
    expect(alertEvents.notifyAlertesChanged).toHaveBeenCalledOnce();
  });

  it("expose un cooldown de 5 minutes", () => {
    expect(ALERTES_GENERATION_COOLDOWN_MS).toBe(5 * 60 * 1000);
  });
});
