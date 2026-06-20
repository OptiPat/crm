import { describe, expect, it } from "vitest";
import { resolveInvestissementOwnerContactId } from "./open-investissement-owner";

describe("resolveInvestissementOwnerContactId", () => {
  it("utilise contact_id quand présent", async () => {
    const result = await resolveInvestissementOwnerContactId(
      { contact_id: 42, foyer_id: 1 },
      async () => []
    );
    expect(result).toEqual({ contactId: 42 });
  });

  it("retombe sur le premier membre du foyer", async () => {
    const result = await resolveInvestissementOwnerContactId(
      { contact_id: undefined, foyer_id: 5, foyer_nom: "Foyer DUPONT" },
      async () => [
        { id: 10, nom: "DUPONT", prenom: "Jean" } as never,
        { id: 11, nom: "DUPONT", prenom: "Marie" } as never,
      ]
    );
    expect(result).toEqual({
      contactId: 10,
      viaFoyerLabel: "Foyer DUPONT",
    });
  });

  it("null si ni contact ni membre foyer", async () => {
    const result = await resolveInvestissementOwnerContactId(
      { foyer_id: 5 },
      async () => []
    );
    expect(result).toBeNull();
  });
});
