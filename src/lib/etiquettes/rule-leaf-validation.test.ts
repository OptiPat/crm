import { describe, expect, it } from "vitest";
import {
  findFirstInvalidRuleLeafIndex,
  isRuleLeafValidForPreview,
} from "./rule-leaf-validation";
import type { RuleLeaf } from "./rule-ast";

describe("rule-leaf-validation", () => {
  it("TYPE_PRODUIT invalide sans type ni nom", () => {
    const leaf: RuleLeaf = {
      type: "TYPE_PRODUIT",
      config: { types: [], noms_produit: [] },
      categories: ["CLIENT"],
    };
    expect(isRuleLeafValidForPreview(leaf)).toBe(false);
    expect(findFirstInvalidRuleLeafIndex([leaf])).toBe(0);
  });

  it("TYPE_PRODUIT valide avec nom seul", () => {
    const leaf: RuleLeaf = {
      type: "TYPE_PRODUIT",
      config: { types: [], noms_produit: ["Epargne Pierre"] },
      categories: ["CLIENT"],
    };
    expect(isRuleLeafValidForPreview(leaf)).toBe(true);
  });
});
