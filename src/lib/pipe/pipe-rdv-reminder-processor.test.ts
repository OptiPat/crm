import { describe, expect, it } from "vitest";
import { isPipeRdvReminderExpired } from "./pipe-rdv-reminder-processor";

describe("pipe-rdv-reminder-processor", () => {
  it("isPipeRdvReminderExpired si le RDV a commencé", () => {
    expect(isPipeRdvReminderExpired(1_000, 1_000)).toBe(true);
    expect(isPipeRdvReminderExpired(999, 1_000)).toBe(true);
    expect(isPipeRdvReminderExpired(1_001, 1_000)).toBe(false);
  });
});
