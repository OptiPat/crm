import { describe, expect, it, vi, beforeEach } from "vitest";
import { executePipeSuiviRdvReschedule } from "@/lib/pipe/pipe-rdv-reschedule-actions";
import { SUIVI_RDV_TITRE } from "@/lib/pipe/pipe-suivi";

vi.mock("@/lib/calendar/rdv-planifier", () => ({
  syncGoogleCalendarForPipeRdv: vi.fn(async () => ({ synced: true, clientAlreadyAccepted: false })),
}));

vi.mock("@/lib/pipe/pipe-rdv-calendar-context", () => ({
  buildPipeRdvCalendarContext: vi.fn(() => ({ additionalAttendeeContactIds: undefined })),
  warnPipeRdvMissingAttendeeEmails: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/tauri-calendar", () => ({
  resolvePipeRdvGoogleEventId: vi.fn(async () => null),
}));

describe("executePipeSuiviRdvReschedule", () => {
  const mockEntry = {
    id: 2,
    pipe_id: 1,
    entry_type: "NOTE" as const,
    titre: null,
    contenu: null,
    occurred_at: 1_700_000_000,
    google_event_id: null,
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000,
  };
  const updateEntry = vi.fn(async () => mockEntry);
  const addEntry = vi.fn(async () => mockEntry);

  beforeEach(() => {
    updateEntry.mockClear();
    addEntry.mockClear();
  });

  it("conserve le titre Suivi et journalise le report", async () => {
    const entry = {
      id: 10,
      pipe_id: 1,
      entry_type: "RDV" as const,
      titre: SUIVI_RDV_TITRE,
      contenu: null,
      occurred_at: 1_700_000_000,
      google_event_id: null,
      created_at: 1_700_000_000,
      updated_at: 1_700_000_000,
    };

    await executePipeSuiviRdvReschedule({
      entry,
      pipe: {
        id: 1,
        stage: "",
        pipe_type: "ACTE_GESTION",
        contact_id: 5,
        contact_prenom: "Jean",
        contact_nom: "DUPONT",
      },
      newOccurredAtUnix: 1_700_086_400,
      updateEntry,
      addEntry,
    });

    expect(updateEntry).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ titre: SUIVI_RDV_TITRE })
    );
    expect(addEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entry_type: "NOTE" })
    );
  });
});
