import { describe, expect, it } from "vitest";
import {
  formatPipeRdvScheduledEmailTrayNotify,
  isPipeRdvFollowUpNotReady,
  isPipeRdvReminderExpired,
} from "./pipe-rdv-reminder-processor";

describe("pipe-rdv-reminder-processor", () => {
  it("isPipeRdvReminderExpired si le RDV a commencé", () => {
    expect(isPipeRdvReminderExpired(1_000, 1_000)).toBe(true);
    expect(isPipeRdvReminderExpired(999, 1_000)).toBe(true);
    expect(isPipeRdvReminderExpired(1_001, 1_000)).toBe(false);
  });

  it("isPipeRdvFollowUpNotReady tant que le RDV n'est pas terminé", () => {
    expect(isPipeRdvFollowUpNotReady(1_000, 1_000)).toBe(false);
    expect(isPipeRdvFollowUpNotReady(1_001, 1_000)).toBe(true);
  });

  it("formatPipeRdvScheduledEmailTrayNotify distingue rappel et suivi", () => {
    expect(formatPipeRdvScheduledEmailTrayNotify({ sentBefore: 0, sentAfter: 0 })).toBeNull();
    expect(formatPipeRdvScheduledEmailTrayNotify({ sentBefore: 1, sentAfter: 0 })?.body).toBe(
      "1 rappel avant RDV envoyé."
    );
    expect(formatPipeRdvScheduledEmailTrayNotify({ sentBefore: 0, sentAfter: 1 })?.body).toBe(
      "1 suivi après RDV envoyé."
    );
    expect(formatPipeRdvScheduledEmailTrayNotify({ sentBefore: 1, sentAfter: 1 })?.body).toBe(
      "1 rappel avant RDV, 1 suivi après RDV envoyés."
    );
  });
});
