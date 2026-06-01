import { describe, expect, it } from "vitest";
import { FOYERS_CHANGED_EVENT } from "./foyer-events";

describe("foyer-events", () => {
  it("expose un nom d'événement stable", () => {
    expect(FOYERS_CHANGED_EVENT).toBe("crm:foyers-changed");
  });
});
