import { describe, expect, it } from "vitest";
import { PARRAINAGE_PRESENCE_CONFIRMATION_TASK_PREFIX } from "@/lib/parrainage-pipe/parrainage-call-schedule";
import { isParrainagePresenceConfirmationTask } from "@/lib/parrainage-pipe/parrainage-jd-outcome";

describe("parrainage-jd-outcome", () => {
  it("repère les tâches J-1 par préfixe de titre", () => {
    const sample = `${PARRAINAGE_PRESENCE_CONFIRMATION_TASK_PREFIX}Jean DUPONT à la JD du jeudi 13 août 2026`;
    expect(isParrainagePresenceConfirmationTask(sample)).toBe(true);
    expect(isParrainagePresenceConfirmationTask("Rappeler le filleul")).toBe(false);
  });
});
