import { describe, expect, it } from "vitest";
import { placementOperationIsSuiviDraft } from "@/lib/placement/suivi-placement-draft";

describe("suivi-placement-draft", () => {
  it("brouillon = PENDING sans journal timeline ni mail scan, lié à un pipe", () => {
    expect(
      placementOperationIsSuiviDraft({
        status: "PENDING",
        pipe_id: 3,
        pipe_timeline_entry_id: null,
        email_received_at: null,
      })
    ).toBe(true);
    expect(
      placementOperationIsSuiviDraft({
        status: "PENDING",
        pipe_id: null,
        pipe_timeline_entry_id: null,
        email_received_at: null,
      })
    ).toBe(false);
    expect(
      placementOperationIsSuiviDraft({
        status: "PENDING",
        pipe_id: 3,
        pipe_timeline_entry_id: 5,
        email_received_at: null,
      })
    ).toBe(false);
    expect(
      placementOperationIsSuiviDraft({
        status: "PENDING",
        pipe_id: 3,
        pipe_timeline_entry_id: null,
        email_received_at: 100,
      })
    ).toBe(false);
  });
});
