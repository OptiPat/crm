import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import { countActiveDescendants, isDeepBranchCollapsed } from "./organisation-branch-stats";

function c(id: number, parrainId?: number): Contact {
  return {
    id,
    nom: "N",
    prenom: `P${id}`,
    categorie: "AUCUN",
    statut_suivi: "AUCUN",
    filleul_categorie: "FILLEUL",
    parrain_id: parrainId,
    created_at: 0,
    updated_at: 0,
  };
}

describe("organisation-branch-stats", () => {
  it("countActiveDescendants compte toute la descendance active", () => {
    const byParrain = new Map<number, Contact[]>([
      [1, [c(2, 1), c(3, 1)]],
      [2, [c(4, 2)]],
    ]);
    expect(countActiveDescendants(1, byParrain)).toBe(3);
    expect(countActiveDescendants(2, byParrain)).toBe(1);
    expect(countActiveDescendants(99, byParrain)).toBe(0);
  });

  it("isDeepBranchCollapsed replie gen5+ sous le parrain gen4", () => {
    expect(isDeepBranchCollapsed(3, 2, false)).toBe(false);
    expect(isDeepBranchCollapsed(4, 2, false)).toBe(true);
    expect(isDeepBranchCollapsed(4, 2, true)).toBe(false);
    expect(isDeepBranchCollapsed(4, 0, false)).toBe(false);
    expect(isDeepBranchCollapsed(5, 1, false)).toBe(false);
  });
});
