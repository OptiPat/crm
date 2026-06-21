import { describe, expect, it } from "vitest";
import {
  countOrphanPartenaireProducts,
  getPartenaireProductOwner,
} from "@/lib/partenaires/partenaires-product-owner";
import type { Investissement } from "@/lib/api/tauri-investissements";

describe("partenaires-product-owner", () => {
  it("résout contact, foyer et orphelin", () => {
    expect(
      getPartenaireProductOwner({ contact_id: 1 }, { 1: "Jean DUPONT" }, {}).kind
    ).toBe("contact");
    expect(
      getPartenaireProductOwner({ foyer_id: 9 }, {}, { 9: "Foyer MARTIN" }).label
    ).toBe("Foyer MARTIN");
    expect(getPartenaireProductOwner({}, {}, {}).kind).toBe("orphan");
  });

  it("compte les orphelins", () => {
    const list = [
      { contact_id: 1 } as Investissement,
      { foyer_id: 2 } as Investissement,
      {} as Investissement,
    ];
    expect(countOrphanPartenaireProducts(list)).toBe(1);
  });
});
