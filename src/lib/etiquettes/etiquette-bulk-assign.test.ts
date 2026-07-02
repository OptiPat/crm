import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  bulkAssignResultMessage,
  filterContactsForBulkAssign,
} from "./etiquette-bulk-assign";

describe("etiquette-bulk-assign", () => {
  it("filterContactsForBulkAssign exclut les déjà tagués", () => {
    const contacts: Contact[] = [
      {
        id: 1,
        nom: "DUPONT",
        prenom: "Jean",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 2,
        nom: "LEGRAND",
        prenom: "Paul",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
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
