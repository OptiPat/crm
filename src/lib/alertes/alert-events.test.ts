import { describe, expect, it } from "vitest";
import { ALERTES_CHANGED_EVENT } from "./alert-events";

describe("alert-events", () => {
  it("expose un nom d'événement stable", () => {
    expect(ALERTES_CHANGED_EVENT).toBe("crm:alertes-changed");
  });
});
