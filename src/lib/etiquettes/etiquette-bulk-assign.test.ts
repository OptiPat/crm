import { describe, expect, it } from "vitest";
import {
  bulkAssignResultMessage,
  filterContactsForBulkAssign,
} from "./etiquette-bulk-assign";

describe("etiquette-bulk-assign", () => {
  it("filterContactsForBulkAssign exclut les déjà tagués", () => {
    const contacts = [
      { id: 1, nom: "DUPONT", prenom: "Jean", categorie: "CLIENT" },
      { id: 2, nom: "LEGRAND", prenom: "Paul", categorie: "CLIENT" },
    ];
    const filtered = filterContactsForBulkAssign(contacts, new Set([1]));
    expect(filtered.map((c) => c.id)).toEqual([2]);
  });

  it("bulkAssignResultMessage", () => {
    expect(bulkAssignResultMessage(3, 0)).toContain("3 contacts tagués");
    expect(bulkAssignResultMessage(2, 1)).toContain("déjà tagué");
    expect(bulkAssignResultMessage(0, 2)).toContain("avait déjà");
  });
});
