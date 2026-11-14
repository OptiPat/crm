import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import {
  maybeAdvanceNouvelleSouscriptionAffaireToGagnee,
  maybeAdvanceVersementAffaireToGagneeAfterClientMail,
  shouldTrackVersementAffaireOnPipeCreate,
  trackVersementAffaireOnPipeCreate,
} from "@/lib/placement/pipe-placement-tracking";
import { VERSEMENT_COMPLEMENTAIRE_ACT_LABEL } from "@/lib/pipe/pipe-suivi";

vi.mock("@/lib/api/tauri-pipe", () => ({
  getPipeById: vi.fn(),
  setPipeStage: vi.fn(),
}));

vi.mock("@/lib/api/tauri-box-placement", () => ({
  createPlacementOperation: vi.fn(),
  getPlacementOperation: vi.fn(),
  listPlacementOperationsForPipe: vi.fn(),
  notifyPlacementOperationsChanged: vi.fn(),
}));

import { getPipeById, setPipeStage } from "@/lib/api/tauri-pipe";
import {
  createPlacementOperation,
  getPlacementOperation,
  listPlacementOperationsForPipe,
} from "@/lib/api/tauri-box-placement";

const versementChild: PipeRecord = {
  id: 10,
  contact_id: 1,
  secondary_contact_id: 0,
  pipe_type: "AFFAIRE",
  parent_pipe_id: 5,
  titre: "Versement complémentaire — DUPONT Jean",
  stage: "PROSPECTION",
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

  it("crée un brouillon VERSEMENT avec montant", async () => {
    vi.mocked(getPipeById).mockResolvedValue({
      ...versementChild,
      id: 5,
      pipe_type: "ACTE_GESTION",
      parent_pipe_id: null,
    });

    const tracked = await trackVersementAffaireOnPipeCreate(versementChild, {
      productLabel: "Cristalliance Avenir",
      montantCentimes: 50_000_00,
    });

    expect(tracked).toBe(true);
    expect(createPlacementOperation).toHaveBeenCalledWith({
      contact_id: 1,
      pipe_id: 10,
      operation_type: "VERSEMENT",
      stellium_label: VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
      product_label: "Cristalliance Avenir",
      montant_centimes: 50_000_00,
      type_produit: "ASSURANCE_VIE",
    });
  });

  it("ignore sans montant (UI versement enfant)", async () => {
    vi.mocked(getPipeById).mockResolvedValue({
      ...versementChild,
      id: 5,
      pipe_type: "ACTE_GESTION",
      parent_pipe_id: null,
    });

    const tracked = await trackVersementAffaireOnPipeCreate(versementChild, {
      productLabel: "Cristalliance Avenir",
    });

    expect(tracked).toBe(false);
    expect(createPlacementOperation).not.toHaveBeenCalled();
  });

  it("ne crée rien si le parent est une affaire", async () => {
    vi.mocked(getPipeById).mockResolvedValue({
      ...versementChild,
      id: 5,
      pipe_type: "AFFAIRE",
      parent_pipe_id: null,
    });

    await trackVersementAffaireOnPipeCreate(versementChild);

    expect(createPlacementOperation).not.toHaveBeenCalled();
  });
});

describe("maybeAdvanceVersementAffaireToGagneeAfterClientMail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passe l'affaire versement en Gagnée après mail client", async () => {
    vi.mocked(getPlacementOperation).mockResolvedValue({
      id: 7,
      contact_id: 1,
      pipe_id: 10,
      pipe_timeline_entry_id: 20,
      operation_type: "VERSEMENT",
      product_label: null,
      stellium_label: VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
      status: "CONFORME",
      gmail_message_id: null,
      email_subject: null,
      email_received_at: 100,
      created_at: 1,
      updated_at: 1,
      client_notified_at: 200,
    });
    vi.mocked(getPipeById).mockResolvedValue(versementChild);

    await maybeAdvanceVersementAffaireToGagneeAfterClientMail({
      id: 7,
      pipe_id: 10,
      status: "CONFORME",
    });

    expect(setPipeStage).toHaveBeenCalledWith(10, "GAGNEE");
  });

  it("ignore si mail client pas encore posé", async () => {
    vi.mocked(getPlacementOperation).mockResolvedValue({
      id: 7,
      contact_id: 1,
      pipe_id: 10,
      pipe_timeline_entry_id: 20,
      operation_type: "VERSEMENT",
      product_label: null,
      stellium_label: VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
      status: "CONFORME",
      gmail_message_id: null,
      email_subject: null,
      email_received_at: 100,
      created_at: 1,
      updated_at: 1,
      client_notified_at: null,
    });

    await maybeAdvanceVersementAffaireToGagneeAfterClientMail({
      id: 7,
      pipe_id: 10,
      status: "CONFORME",
    });

    expect(setPipeStage).not.toHaveBeenCalled();
  });
});

describe("maybeAdvanceVersementAffaireToGagneeAfterClientMail — nouvelle souscription", () => {
  const souscriptionChild: PipeRecord = {
    ...versementChild,
    id: 11,
    titre: "Nouvelle souscription — DUPONT Jean",
  };
  const op = (id: number, patch: Record<string, unknown> = {}) => ({
    id,
    contact_id: 1,
    pipe_id: 11,
    pipe_timeline_entry_id: null,
    operation_type: "SOUSCRIPTION",
    product_label: "Corum Origin",
    stellium_label: "Souscription",
    status: "CONFORME",
    gmail_message_id: null,
    email_subject: null,
    email_received_at: 100,
    created_at: 1,
    updated_at: 1,
    client_notified_at: 200,
    ...patch,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPipeById).mockResolvedValue(souscriptionChild);
    vi.mocked(getPlacementOperation).mockResolvedValue(op(1) as never);
  });

  it("reste en cours tant qu'une autre souscription n'est pas notifiée", async () => {
    vi.mocked(listPlacementOperationsForPipe).mockResolvedValue([
      op(1),
      op(2, { status: "PENDING", client_notified_at: null }),
    ] as never);
    await maybeAdvanceVersementAffaireToGagneeAfterClientMail({ id: 1, pipe_id: 11, status: "CONFORME" });
    expect(setPipeStage).not.toHaveBeenCalled();
  });

  it("passe en Gagnée quand toutes les souscriptions actives sont notifiées", async () => {
    vi.mocked(listPlacementOperationsForPipe).mockResolvedValue([
      op(1),
      op(2),
      op(3, { status: "PENDING", client_notified_at: null, dismissed_at: 50 }),
    ] as never);
    await maybeAdvanceVersementAffaireToGagneeAfterClientMail({ id: 1, pipe_id: 11, status: "CONFORME" });
    expect(setPipeStage).toHaveBeenCalledWith(11, "GAGNEE");
  });
});

describe("maybeAdvanceNouvelleSouscriptionAffaireToGagnee", () => {
  const child = {
    id: 11,
    pipe_type: "AFFAIRE",
    parent_pipe_id: 5,
    titre: "Nouvelle souscription — DUPONT Jean",
    stage: "PROSPECTION",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passe en Gagnée après retrait de la dernière souscription non notifiée", async () => {
    vi.mocked(listPlacementOperationsForPipe).mockResolvedValue([
      { id: 1, status: "CONFORME", client_notified_at: 200 },
      { id: 2, status: "PENDING", client_notified_at: null, dismissed_at: 300 },
    ] as never);
    await expect(maybeAdvanceNouvelleSouscriptionAffaireToGagnee(child)).resolves.toBe(true);
    expect(setPipeStage).toHaveBeenCalledWith(11, "GAGNEE");
  });

  it("ignore une affaire sans souscription ou hors nouvelle souscription", async () => {
    vi.mocked(listPlacementOperationsForPipe).mockResolvedValue([] as never);
    await expect(maybeAdvanceNouvelleSouscriptionAffaireToGagnee(child)).resolves.toBe(false);
    await expect(
      maybeAdvanceNouvelleSouscriptionAffaireToGagnee({ ...child, titre: "SCPI Corum" })
    ).resolves.toBe(false);
    expect(setPipeStage).not.toHaveBeenCalled();
  });
});
