import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlacementOperation } from "@/lib/api/tauri-box-placement";

const sendEmailMock = vi.fn();
const reserveMock = vi.fn();
const releaseMock = vi.fn();
const getContactByIdMock = vi.fn();
const getPipeByIdMock = vi.fn();
const journalMock = vi.fn();
const advanceMock = vi.fn();

vi.mock("sonner", () => ({ toast: { warning: vi.fn(), success: vi.fn() } }));

vi.mock("@/lib/api/tauri-email-oauth", () => ({
  getEmailConnectionStatus: vi.fn(async () => ({ connected: true })),
}));

vi.mock("@/lib/emails/template-email-formality", () => ({
  pickTemplateContentForRegistre: vi.fn(() => ({
    sujet: "Confirmation",
    corps: "Bonjour",
    variables: null,
    agenda_link_id: null,
  })),
  pickTemplateCorpsHtmlForRegistre: vi.fn(() => "<p>Bonjour</p>"),
  contactRegistreFromContact: vi.fn(() => "VOUS"),
}));

vi.mock("@/lib/emails/template-email-html", () => ({
  canonicalizeTemplateCorpsHtml: vi.fn((html: string) => html),
  sanitizeEmailHeaderValue: vi.fn((value: string) => value),
}));

vi.mock("@/lib/emails/template-email-meta", () => ({
  renderTemplatePreview: vi.fn(() => ({
    subject: "Confirmation",
    body: "Bonjour",
    body_html: "<p>Bonjour</p>",
  })),
}));

vi.mock("@/lib/placement/placement-conforme-email-vars", () => ({
  buildPlacementConformeEmailExtraVariablesForSend: vi.fn(() => ({})),
}));

vi.mock("@/lib/pipe/pipe-rdv-email-vars", () => ({
  pipeRdvRegistreForContact: vi.fn(() => "VOUS"),
  coContactFieldsForRecipient: vi.fn(() => ({})),
}));

vi.mock("@/lib/emails/template-email-placement-conforme", () => ({
  resolvePlacementConformeTemplateForOperation: vi.fn(async () => ({ id: 1, nom: "Test" })),
  loadPlacementConformeTemplatePair: vi.fn(async () => ({
    principal: {
      nom: "P",
      sujet: "S",
      corps: "C",
      variables: null,
      agenda_link_id: null,
    },
    tutoiement: null,
  })),
}));

vi.mock("@/lib/api/tauri-settings", () => ({
  getCgpConfig: vi.fn(async () => ({})),
}));

vi.mock("@/lib/api/tauri-contacts", () => ({
  getContactById: (...args: unknown[]) => getContactByIdMock(...args),
}));

vi.mock("@/lib/api/tauri-email", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock("@/lib/api/tauri-email-send-log", () => ({
  logEmailSendError: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/tauri-pipe", () => ({
  getPipeById: (...args: unknown[]) => getPipeByIdMock(...args),
}));

vi.mock("@/lib/api/tauri-box-placement", () => ({
  reservePlacementClientNotification: (...args: unknown[]) => reserveMock(...args),
  releasePlacementClientNotification: (...args: unknown[]) => releaseMock(...args),
  getPlacementOperation: vi.fn(async (id: number) => baseOperation({ id })),
}));

vi.mock("@/lib/placement/placement-journal", () => ({
  journalPlacementClientEmailSent: (...args: unknown[]) => journalMock(...args),
}));

vi.mock("@/lib/placement/pipe-placement-tracking", () => ({
  maybeAdvanceVersementAffaireToGagneeAfterClientMail: (...args: unknown[]) =>
    advanceMock(...args),
}));

import {
  maybeSendPlacementConformeEmailForOperation,
  processPlacementConformeNotifications,
} from "@/lib/placement/placement-conforme-email";

function baseOperation(
  overrides: Partial<PlacementOperation> = {}
): PlacementOperation {
  return {
    id: 145,
    contact_id: 72,
    pipe_id: 115,
    pipe_timeline_entry_id: 900,
    operation_type: "SOUSCRIPTION",
    product_label: "Comète CIF",
    stellium_label: "Souscription",
    status: "CONFORME",
    created_at: 1,
    updated_at: 1,
    client_notified_at: null,
    ...overrides,
  };
}

describe("maybeSendPlacementConformeEmailForOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reserveMock.mockResolvedValue(true);
    releaseMock.mockResolvedValue(true);
    sendEmailMock.mockResolvedValue(undefined);
    journalMock.mockResolvedValue(undefined);
    advanceMock.mockResolvedValue(undefined);
    getPipeByIdMock.mockResolvedValue({
      id: 115,
      contact_id: 72,
      secondary_contact_id: 73,
      contact_prenom: "Jean",
      contact_nom: "DUPONT",
      secondary_contact_prenom: "Marie",
      secondary_contact_nom: "LEGRAND",
    });
    getContactByIdMock.mockImplementation(async (id: number) => ({
      id,
      prenom: id === 72 ? "Jean" : "Marie",
      nom: id === 72 ? "DUPONT" : "LEGRAND",
      email: id === 72 ? "a@example.com" : "b@example.com",
      registre: "VOUS",
    }));
  });

  it("envoie aux deux contacts couple et conserve la réservation", async () => {
    const outcome = await maybeSendPlacementConformeEmailForOperation(
      baseOperation(),
      { quiet: true }
    );

    expect(outcome).toEqual({ outcome: "sent", emailsSent: 2 });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(releaseMock).not.toHaveBeenCalled();
    expect(journalMock).toHaveBeenCalledTimes(1);
  });

  it("libère la réservation si un seul des deux emails part", async () => {
    getContactByIdMock.mockImplementation(async (id: number) => {
      if (id === 73) throw new Error("Marie LEGRAND : pas d'email valide");
      return {
        id,
        prenom: "Jean",
        nom: "DUPONT",
        email: "a@example.com",
        registre: "VOUS",
      };
    });

    const outcome = await maybeSendPlacementConformeEmailForOperation(
      baseOperation(),
      { quiet: true }
    );

    expect(outcome).toEqual({ outcome: "error", emailsSent: 1 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledWith(145);
    expect(journalMock).not.toHaveBeenCalled();
  });

  it("pipe solo : un seul destinataire", async () => {
    getPipeByIdMock.mockResolvedValue({
      id: 50,
      contact_id: 72,
      secondary_contact_id: null,
      contact_prenom: "Jean",
      contact_nom: "DUPONT",
      secondary_contact_prenom: null,
      secondary_contact_nom: null,
    });

    const outcome = await maybeSendPlacementConformeEmailForOperation(
      baseOperation({ pipe_id: 50 }),
      { quiet: true }
    );

    expect(outcome).toEqual({ outcome: "sent", emailsSent: 1 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe("processPlacementConformeNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reserveMock.mockResolvedValue(true);
    releaseMock.mockResolvedValue(true);
    sendEmailMock.mockResolvedValue(undefined);
    journalMock.mockResolvedValue(undefined);
    advanceMock.mockResolvedValue(undefined);
    getPipeByIdMock.mockResolvedValue({
      id: 115,
      contact_id: 72,
      secondary_contact_id: 73,
      contact_prenom: "Jean",
      contact_nom: "DUPONT",
      secondary_contact_prenom: "Marie",
      secondary_contact_nom: "LEGRAND",
    });
    getContactByIdMock.mockImplementation(async (id: number) => ({
      id,
      prenom: id === 72 ? "Jean" : "Marie",
      nom: id === 72 ? "DUPONT" : "LEGRAND",
      email: "x@example.com",
      registre: "VOUS",
    }));
  });

  it("compte les emails réels, pas seulement les opérations", async () => {
    const result = await processPlacementConformeNotifications(
      [baseOperation()],
      { quiet: true }
    );

    expect(result.sent).toBe(1);
    expect(result.emailsSent).toBe(2);
  });
});
