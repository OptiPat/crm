import { describe, expect, it } from "vitest";
import { buildRuleTree, isRuleTreeConfig, parseRuleTree, toRuleTreeSave } from "./rule-ast";

describe("rule-ast", () => {
  it("detects rule tree json", () => {
    const raw = JSON.stringify({
      v: 1,
      op: "and",
      children: [{ type: "DELAI_SANS_CONTACT", config: { jours: 365 }, categories: ["CLIENT"] }],
    });
    expect(isRuleTreeConfig(raw)).toBe(true);
    expect(parseRuleTree(raw)?.children).toHaveLength(1);
  });

  it("builds RULE_TREE save payload", () => {
    const saved = toRuleTreeSave("and", [
      { type: "DELAI_SANS_CONTACT", config: { jours: 180 }, categories: ["CLIENT"] },
    ]);
    expect(saved.auto_condition_type).toBe("RULE_TREE");
    expect(JSON.parse(saved.auto_condition_config)).toEqual(buildRuleTree([
      { type: "DELAI_SANS_CONTACT", config: { jours: 180 }, categories: ["CLIENT"] },
    ]));
  });
});
