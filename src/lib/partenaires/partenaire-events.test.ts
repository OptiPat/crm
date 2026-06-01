import { describe, expect, it } from "vitest";
import { PARTENAIRES_CHANGED_EVENT } from "./partenaire-events";

describe("partenaire-events", () => {
  it("expose un nom d'événement stable", () => {
    expect(PARTENAIRES_CHANGED_EVENT).toBe("crm:partenaires-changed");
  });
});
