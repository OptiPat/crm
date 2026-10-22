import { describe, expect, it } from "vitest";
import {
  placementOperationIsArchivable,
  placementOperationIsArchived,
} from "@/lib/placement/placement-operation-tracking";

const base = {
  client_notified_at: null as number | null,
  dismissed_at: null as number | null,
  archived_at: null as number | null,
};

describe("placement-operation-tracking archivage", () => {
  it("archivé seulement si archived_at > 0", () => {
    expect(placementOperationIsArchived(base)).toBe(false);
    expect(placementOperationIsArchived({ ...base, archived_at: 0 })).toBe(false);
    expect(placementOperationIsArchived({ ...base, archived_at: 1_700_000_000 })).toBe(true);
  });

  it("archivable : mail client envoyé, ni retiré ni archivé", () => {
    expect(placementOperationIsArchivable(base)).toBe(false);
    expect(
      placementOperationIsArchivable({ ...base, client_notified_at: 1_700_000_000 })
    ).toBe(true);
    expect(
      placementOperationIsArchivable({
        ...base,
        client_notified_at: 1_700_000_000,
        dismissed_at: 1_700_000_100,
      })
    ).toBe(false);
    expect(
      placementOperationIsArchivable({
        ...base,
        client_notified_at: 1_700_000_000,
        archived_at: 1_700_000_100,
      })
    ).toBe(false);
  });
});
