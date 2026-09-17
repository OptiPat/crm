import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelPipeRdvConfirmationRetry,
  clearPipeRdvConfirmationRetryTimersForTests,
  firstTransientConfirmationError,
  peekPipeRdvConfirmationRetryContactIdsForTests,
  pipeRdvConfirmationRetryContactIds,
  PIPE_RDV_CONFIRMATION_MAX_AUTO_RETRIES,
  resetPipeRdvConfirmationRetryStateForTests,
  schedulePipeRdvConfirmationRetryAfterError,
} from "@/lib/pipe/pipe-rdv-confirmation-retry";
import type { PipeRdvConfirmationSendOptions } from "@/lib/pipe/pipe-rdv-confirmation-email";

const sendMock = vi.fn(async (_opts: PipeRdvConfirmationSendOptions) => ({
  sent: 1,
  errors: [] as string[],
}));

vi.mock("@/lib/pipe/pipe-rdv-confirmation-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pipe/pipe-rdv-confirmation-email")>();
  return {
    ...actual,
    maybeSendPipeRdvConfirmationEmail: (opts: PipeRdvConfirmationSendOptions) => sendMock(opts),
  };
});

const GMAIL_QUOTA_403 = `Gmail API: {
  "error": {
    "code": 403,
    "message": "Quota exceeded for quota metric 'Total Query Cost'",
    "errors": [{ "reason": "rateLimitExceeded" }],
    "status": "PERMISSION_DENIED"
  }
}`;

function sampleOptions(entryId: number): PipeRdvConfirmationSendOptions {
  return {
    pipe: {
      id: 1,
      contact_id: 2,
      contact_prenom: "Jean",
      contact_nom: "DUPONT",
      secondary_contact_id: null,
      secondary_contact_prenom: null,
      secondary_contact_nom: null,
    },
    rdvStage: "R1",
    pipeTimelineEntryId: entryId,
    startAtUnix: 1_800_000_000,
    endAtUnix: 1_800_003_600,
  };
}

describe("schedulePipeRdvConfirmationRetryAfterError", () => {
  afterEach(() => {
    resetPipeRdvConfirmationRetryStateForTests();
    sendMock.mockClear();
    vi.useRealTimers();
  });

  it("un seul timer : met à jour les destinataires restants", () => {
    vi.useFakeTimers();
    expect(schedulePipeRdvConfirmationRetryAfterError(sampleOptions(44), GMAIL_QUOTA_403)).toBe(
      true
    );
    expect(
      schedulePipeRdvConfirmationRetryAfterError(
        { ...sampleOptions(44), onlyContactIds: [9] },
        GMAIL_QUOTA_403
      )
    ).toBe(true);
    expect(peekPipeRdvConfirmationRetryContactIdsForTests(44)).toEqual([9]);
    expect(cancelPipeRdvConfirmationRetry(44)).toBe(true);
    expect(cancelPipeRdvConfirmationRetry(44)).toBe(false);
  });

  it("ne planifie pas une erreur définitive", () => {
    expect(
      schedulePipeRdvConfirmationRetryAfterError(sampleOptions(44), "pas d'email valide")
    ).toBe(false);
  });

  it("coupe après le plafond de relances", () => {
    for (let i = 0; i < PIPE_RDV_CONFIRMATION_MAX_AUTO_RETRIES; i += 1) {
      expect(
        schedulePipeRdvConfirmationRetryAfterError(sampleOptions(45), GMAIL_QUOTA_403)
      ).toBe(true);
      clearPipeRdvConfirmationRetryTimersForTests();
    }
    expect(schedulePipeRdvConfirmationRetryAfterError(sampleOptions(45), GMAIL_QUOTA_403)).toBe(
      false
    );
  });

  it("annule le timer après un envoi réussi (évite un doublon)", () => {
    vi.useFakeTimers();
    expect(schedulePipeRdvConfirmationRetryAfterError(sampleOptions(44), GMAIL_QUOTA_403)).toBe(
      true
    );
    expect(cancelPipeRdvConfirmationRetry(44)).toBe(true);
    expect(cancelPipeRdvConfirmationRetry(44)).toBe(false);
    expect(schedulePipeRdvConfirmationRetryAfterError(sampleOptions(44), GMAIL_QUOTA_403)).toBe(
      true
    );
  });

  it("n'envoie pas après cancel même si la minute est écoulée", async () => {
    vi.useFakeTimers();
    schedulePipeRdvConfirmationRetryAfterError(sampleOptions(44), GMAIL_QUOTA_403);
    cancelPipeRdvConfirmationRetry(44);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("pipeRdvConfirmationRetryContactIds", () => {
  it("ne relance que les contacts en quota, même si errors[0] est définitif", () => {
    const failures = [
      { contactId: 2, message: "Jean DUPONT : pas d'email valide" },
      { contactId: 3, message: `Marie LEGRAND : ${GMAIL_QUOTA_403}` },
    ];
    expect(pipeRdvConfirmationRetryContactIds(failures)).toEqual([3]);
    expect(firstTransientConfirmationError(failures)).toContain("Quota exceeded");
  });

  it("ne relance personne s'il n'y a que des erreurs définitives", () => {
    expect(
      pipeRdvConfirmationRetryContactIds([
        { contactId: 2, message: "Jean DUPONT : pas d'email valide" },
      ])
    ).toEqual([]);
  });
});
