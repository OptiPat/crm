import { describe, expect, it } from "vitest";
import { CONTACTS_CHANGED_EVENT } from "./contact-events";

describe("contact-events", () => {
  it("expose un nom d'événement stable", () => {
    expect(CONTACTS_CHANGED_EVENT).toBe("crm:contacts-changed");
  });
});
