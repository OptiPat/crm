import { describe, expect, it } from "vitest";
import {
  defaultTriggerRuleChildren,
  isTriggerRuleTreeValid,
  triggerRuleTreeToConfig,
} from "@/lib/emails/template-email-trigger-rule-tree";

describe("template-email-trigger-rule-tree", () => {
  it("sérialise une règle combinée TMI + revenus", () => {
    const next = triggerRuleTreeToConfig("and", defaultTriggerRuleChildren());
    expect(next.condition_type).toBe("RULE_TREE");
    const parsed = JSON.parse(next.condition_config) as {
      op: string;
      children: { type: string }[];
    };
    expect(parsed.op).toBe("and");
    expect(parsed.children.map((c) => c.type)).toEqual(["TMI", "REVENUS_ANNUELS"]);
    expect(isTriggerRuleTreeValid(next.condition_config)).toBe(true);
  });
});
