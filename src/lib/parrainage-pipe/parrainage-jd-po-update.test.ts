import { describe, expect, it } from "vitest";
import {
  parrainageJdPoOutcomeUpdateDueUnix,
  parrainagePipeNeedsJdPoOutcomeUpdate,
  PARRAINAGE_JD_PO_OUTCOME_UPDATE_HOUR,
} from "@/lib/parrainage-pipe/parrainage-jd-po-update";

describe("parrainage-jd-po-update", () => {
  it("déclenche à 18h locale le jour de la JD", () => {
    const invitationUnix = Math.floor(new Date(2026, 7, 16, 9, 0, 0, 0).getTime() / 1000);
    const dueUnix = parrainageJdPoOutcomeUpdateDueUnix(invitationUnix);
    expect(new Date(dueUnix * 1000).getHours()).toBe(PARRAINAGE_JD_PO_OUTCOME_UPDATE_HOUR);

    expect(
      parrainagePipeNeedsJdPoOutcomeUpdate(
        { stage: "CONFIRME", invitation_date: invitationUnix },
        new Date(2026, 7, 16, 17, 59, 0, 0).getTime()
      )
    ).toBe(false);

    expect(
      parrainagePipeNeedsJdPoOutcomeUpdate(
        { stage: "CONFIRME", invitation_date: invitationUnix },
        new Date(2026, 7, 16, 18, 0, 0, 0).getTime()
      )
    ).toBe(true);
  });

  it("ignore les autres étapes", () => {
    const invitationUnix = Math.floor(new Date(2026, 7, 15, 9, 0, 0, 0).getTime() / 1000);
    expect(
      parrainagePipeNeedsJdPoOutcomeUpdate(
        { stage: "PRESENT", invitation_date: invitationUnix },
        new Date(2026, 7, 16, 19, 0, 0, 0).getTime()
      )
    ).toBe(false);
  });
});
