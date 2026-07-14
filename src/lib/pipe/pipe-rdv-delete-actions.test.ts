import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { executeRdvCancellation } from "@/lib/pipe/pipe-rdv-delete-actions";
import { setPipeStage } from "@/lib/api/tauri-pipe";
import {
  markPipeRdvCalendarCancelled,
  resolvePipeRdvGoogleEventId,
} from "@/lib/api/tauri-calendar";
import { cancelLinkedGoogleRdv } from "@/lib/calendar/rdv-planifier";

vi.mock("@/lib/api/tauri-pipe", () => ({
  setPipeStage: vi.fn(),
}));

vi.mock("@/lib/api/tauri-calendar", () => ({
  markPipeRdvCalendarCancelled: vi.fn(),
  resolvePipeRdvGoogleEventId: vi.fn(),
}));

vi.mock("@/lib/calendar/rdv-planifier", () => ({
  cancelLinkedGoogleRdv: vi.fn(),
}));

describe("executeRdvCancellation", () => {
  const addEntry = vi.fn(
    async (): Promise<PipeTimelineEntryRecord> => ({
      id: 99,
      pipe_id: 1,
      entry_type: "NOTE",
      titre: "RDV annulé",
      contenu: null,
      occurred_at: 1,
      created_at: 1,
      google_event_id: null,
    })
  );
  const removeEntry = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.mocked(setPipeStage).mockReset();
    vi.mocked(markPipeRdvCalendarCancelled).mockReset();
    vi.mocked(resolvePipeRdvGoogleEventId).mockReset();
    vi.mocked(cancelLinkedGoogleRdv).mockReset();
    addEntry.mockClear();
    removeEntry.mockClear();
  });

  it("retire Google Agenda par défaut", async () => {
    vi.mocked(resolvePipeRdvGoogleEventId).mockResolvedValue("evt-google-1");

    const result = await executeRdvCancellation({
      pipe: { id: 1, stage: "PROSPECTION", pipe_type: "AFFAIRE" },
      entry: {
        id: 10,
        pipe_id: 1,
        entry_type: "RDV",
        titre: "R1",
        contenu: null,
        occurred_at: 1_700_000_000,
        created_at: 1,
        google_event_id: null,
      },
      addEntry,
      removeEntry,
    });

    expect(cancelLinkedGoogleRdv).toHaveBeenCalledWith("evt-google-1");
    expect(markPipeRdvCalendarCancelled).toHaveBeenCalledWith(10);
    expect(result.googleCancelled).toBe(true);
  });

  it("n'appelle pas Google si cancelGoogle=false", async () => {
    await executeRdvCancellation({
      pipe: { id: 1, stage: "PROSPECTION", pipe_type: "AFFAIRE" },
      entry: {
        id: 10,
        pipe_id: 1,
        entry_type: "RDV",
        titre: "R1",
        contenu: null,
        occurred_at: 1_700_000_000,
        created_at: 1,
        google_event_id: "evt-direct",
      },
      cancelGoogle: false,
      addEntry,
      removeEntry,
    });

    expect(cancelLinkedGoogleRdv).not.toHaveBeenCalled();
    expect(resolvePipeRdvGoogleEventId).not.toHaveBeenCalled();
  });

  it("annule le RDV R1 et remet en prospection si affaire en R1", async () => {
    const result = await executeRdvCancellation({
      pipe: { id: 1, stage: "R1", pipe_type: "AFFAIRE" },
      entry: {
        id: 10,
        pipe_id: 1,
        entry_type: "RDV",
        titre: "R1",
        contenu: null,
        occurred_at: 1_700_000_000,
        created_at: 1,
        google_event_id: "evt-1",
      },
      cancelGoogle: false,
      allEntries: [
        {
          id: 10,
          pipe_id: 1,
          entry_type: "RDV",
          titre: "R1",
          contenu: null,
          occurred_at: 1_700_000_000,
          created_at: 1,
        },
      ],
      addEntry,
      removeEntry,
    });

    expect(removeEntry).toHaveBeenCalledWith(10);
    expect(setPipeStage).toHaveBeenCalledWith(1, "PROSPECTION", { notes: null });
    expect(result.revertedStage).toBe("PROSPECTION");
  });

  it("annule le RDV R2 et recule en R1 si affaire en R2", async () => {
    const result = await executeRdvCancellation({
      pipe: { id: 1, stage: "R2", pipe_type: "AFFAIRE" },
      entry: {
        id: 11,
        pipe_id: 1,
        entry_type: "RDV",
        titre: "R2",
        contenu: null,
        occurred_at: 1_700_000_000,
        created_at: 1,
        google_event_id: null,
      },
      cancelGoogle: false,
      allEntries: [
        {
          id: 11,
          pipe_id: 1,
          entry_type: "RDV",
          titre: "R2",
          contenu: null,
          occurred_at: 1_700_000_000,
          created_at: 1,
        },
      ],
      addEntry,
      removeEntry,
    });

    expect(setPipeStage).toHaveBeenCalledWith(1, "R1", { notes: null });
    expect(result.revertedStage).toBe("R1");
  });
});
