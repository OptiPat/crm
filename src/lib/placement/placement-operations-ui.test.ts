import { describe, expect, it } from "vitest";
import {
  isPlacementRowVisibleInSuivi,
  placementOperationIsPipeTracked,
} from "@/lib/placement/placement-operations-ui";

describe("placement-operations-ui pipe tracking", () => {
  it("pipe_timeline_entry_id requis pour suivi email client", () => {
    expect(placementOperationIsPipeTracked({ pipe_timeline_entry_id: 12 })).toBe(true);
    expect(placementOperationIsPipeTracked({ pipe_timeline_entry_id: null })).toBe(false);
  });

  it("CONFORME sans journal pipe masqué du suivi email", () => {
    expect(
      isPlacementRowVisibleInSuivi({
        status: "CONFORME",
        client_notified_at: null,
        pipe_timeline_entry_id: null,
      })
    ).toBe(false);
    expect(
      isPlacementRowVisibleInSuivi({
        status: "CONFORME",
        client_notified_at: null,
        pipe_timeline_entry_id: 5,
      })
    ).toBe(true);
  });
});
