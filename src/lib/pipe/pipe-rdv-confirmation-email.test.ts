import { describe, expect, it } from "vitest";
import {
  isPipeRdvConfirmationEmailEligible,
  planPipeRdvTransactionalEmails,
} from "@/lib/pipe/pipe-rdv-confirmation-email";

describe("isPipeRdvConfirmationEmailEligible", () => {
  it("autorise une confirmation pour un RDV strictement futur", () => {
    const now = 1_700_000_000_000;
    expect(isPipeRdvConfirmationEmailEligible(1_700_000_001, now)).toBe(true);
  });

  it("refuse une confirmation pour un RDV déjà commencé ou passé", () => {
    const now = 1_700_000_000_000;
    expect(isPipeRdvConfirmationEmailEligible(1_700_000_000, now)).toBe(false);
    expect(isPipeRdvConfirmationEmailEligible(1_699_999_999, now)).toBe(false);
  });
});

describe("planPipeRdvTransactionalEmails", () => {
  it("resync toujours les rappels, même si le RDV est passé", () => {
    const now = 1_700_000_000_000;
    expect(planPipeRdvTransactionalEmails(1_699_999_999, now)).toEqual({
      resyncScheduledEmails: true,
      sendConfirmation: false,
    });
  });

  it("resync et confirme un RDV encore à venir", () => {
    const now = 1_700_000_000_000;
    expect(planPipeRdvTransactionalEmails(1_700_000_001, now)).toEqual({
      resyncScheduledEmails: true,
      sendConfirmation: true,
    });
  });
});
