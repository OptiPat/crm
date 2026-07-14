import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import {
  shouldTrackVersementAffaireOnPipeCreate,
  trackVersementAffaireOnPipeCreate,
} from "@/lib/placement/pipe-placement-tracking";

vi.mock("@/lib/api/tauri-pipe", () => ({
  getPipeById: vi.fn(),
}));

vi.mock("@/lib/api/tauri-pipe-timeline", () => ({
  listPipeTimelineEntries: vi.fn(),
}));

vi.mock("@/lib/api/tauri-box-placement", () => ({
  createPlacementOperation: vi.fn(),
  notifyPlacementOperationsChanged: vi.fn(),
}));

import { getPipeById } from "@/lib/api/tauri-pipe";
import { listPipeTimelineEntries } from "@/lib/api/tauri-pipe-timeline";
import { createPlacementOperation } from "@/lib/api/tauri-box-placement";

const versementChild: PipeRecord = {
  id: 10,
  contact_id: 1,
  secondary_contact_id: 0,
  pipe_type: "AFFAIRE",
  parent_pipe_id: 5,
  titre: "Versement complémentaire — DUPONT Jean",
  stage: "R3",
  notes: null,
  created_at: 1,
  updated_at: 1,
  contact_nom: "DUPONT",
  contact_prenom: "Jean",
  secondary_contact_nom: null,
  secondary_contact_prenom: null,
  parent_titre: "Suivi",
};

describe("shouldTrackVersementAffaireOnPipeCreate", () => {
  it("accepte une affaire enfant d'un Suivi", () => {
    expect(shouldTrackVersementAffaireOnPipeCreate(versementChild, "ACTE_GESTION")).toBe(true);
  });

  it("refuse une affaire enfant d'une autre affaire", () => {
    expect(shouldTrackVersementAffaireOnPipeCreate(versementChild, "AFFAIRE")).toBe(false);
  });

  it("refuse sans parent", () => {
    expect(
      shouldTrackVersementAffaireOnPipeCreate(
        { ...versementChild, parent_pipe_id: null },
        "ACTE_GESTION"
      )
    ).toBe(false);
  });
});

describe("trackVersementAffaireOnPipeCreate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crée un VERSEMENT PENDING lié à l'entrée CREATION si parent Suivi", async () => {
    vi.mocked(getPipeById).mockResolvedValue({
      ...versementChild,
      id: 5,
      pipe_type: "ACTE_GESTION",
      parent_pipe_id: null,
    });
    vi.mocked(listPipeTimelineEntries).mockResolvedValue([
      {
        id: 99,
        pipe_id: 10,
        entry_type: "CREATION",
        titre: "Versement complémentaire — DUPONT Jean",
        contenu: null,
        occurred_at: 1,
        created_at: 1,
        google_event_id: null,
      },
    ]);
    vi.mocked(createPlacementOperation).mockResolvedValue({
      id: 1,
      contact_id: 1,
      pipe_id: 10,
      pipe_timeline_entry_id: 99,
      operation_type: "VERSEMENT",
      product_label: null,
      stellium_label: null,
      status: "PENDING",
      gmail_message_id: null,
      email_subject: null,
      email_received_at: null,
      created_at: 1,
      updated_at: 1,
      client_notified_at: null,
    });

    await trackVersementAffaireOnPipeCreate(versementChild);

    expect(createPlacementOperation).toHaveBeenCalledWith({
      contact_id: 1,
      pipe_id: 10,
      pipe_timeline_entry_id: 99,
      operation_type: "VERSEMENT",
    });
  });

  it("ne crée rien si le parent est une affaire", async () => {
    vi.mocked(getPipeById).mockResolvedValue({
      ...versementChild,
      id: 5,
      pipe_type: "AFFAIRE",
      parent_pipe_id: null,
    });

    await trackVersementAffaireOnPipeCreate(versementChild);

    expect(listPipeTimelineEntries).not.toHaveBeenCalled();
    expect(createPlacementOperation).not.toHaveBeenCalled();
  });
});
