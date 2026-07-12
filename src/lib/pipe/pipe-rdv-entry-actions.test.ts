import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  describeGoogleCalendarSyncLine,
  toastAfterPipeRdvReschedule,
  toastAfterRdvSave,
  toastPipeRdvOutcome,
} from "@/lib/pipe/pipe-rdv-entry-actions";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("pipe-rdv-entry-actions toasts", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.warning).mockReset();
  });

  it("describeGoogleCalendarSyncLine couvre synced, not_connected, no_contact, past", () => {
    expect(
      describeGoogleCalendarSyncLine({ synced: true, clientAlreadyAccepted: false })
    ).toBe("Synchronisé avec Google Agenda.");
    expect(
      describeGoogleCalendarSyncLine({ synced: false, reason: "not_connected" })
    ).toBe("Google Agenda non connecté (Paramètres).");
    expect(
      describeGoogleCalendarSyncLine({ synced: false, reason: "no_contact" })
    ).toBe("Google Agenda : contact introuvable.");
    expect(
      describeGoogleCalendarSyncLine({ synced: false, reason: "past" })
    ).toContain("date/heure future");
  });

  it("toastPipeRdvOutcome fusionne Pipe + Agenda en un seul toast", () => {
    toastPipeRdvOutcome("RDV enregistré dans le Pipe.", {
      synced: true,
      clientAlreadyAccepted: false,
    });
    expect(toast.success).toHaveBeenCalledWith(
      "RDV enregistré dans le Pipe. Synchronisé avec Google Agenda.",
      { id: "pipe-rdv-outcome" }
    );
  });

  it("toastAfterPipeRdvReschedule utilise le même libellé partout", () => {
    toastAfterPipeRdvReschedule({ synced: true, clientAlreadyAccepted: true });
    expect(toast.success).toHaveBeenCalledWith(
      "RDV décalé — Pipe et Google Agenda mis à jour.",
      { id: "pipe-rdv-outcome" }
    );
  });

  it("toastAfterRdvSave sans result utilise l'id Pipe", () => {
    toastAfterRdvSave("R1", null, "RDV ajouté");
    expect(toast.success).toHaveBeenCalledWith("RDV ajouté", { id: "pipe-rdv-outcome" });
  });

  it("toastAfterRdvSave warning si Agenda en échec", () => {
    toastAfterRdvSave("R1", {
      advanced: true,
      calendar: { synced: false, reason: "error", message: "Quota dépassé" },
    });
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining("Google Agenda : Quota dépassé"),
      { id: "pipe-rdv-outcome" }
    );
  });
});
