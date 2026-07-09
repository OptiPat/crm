import {
  buildRuleTree,
  parseRuleTree,
  stringifyRuleTree,
  type RuleLeaf,
  type RuleOp,
  type RuleTree,
} from "@/lib/etiquettes/rule-ast";
import { findFirstInvalidRuleLeafIndex } from "@/lib/etiquettes/rule-leaf-validation";

export function isTriggerRuleTree(conditionType: string | null | undefined): boolean {
  return conditionType === "RULE_TREE";
}

export function parseTriggerRuleTree(conditionConfig: string | null | undefined): RuleTree | null {
  return parseRuleTree(conditionConfig);
}

export function triggerRuleTreeToConfig(
  op: RuleOp,
  children: RuleLeaf[]
): { condition_type: "RULE_TREE"; condition_config: string; categories: string[] } {
  const tree = buildRuleTree(children, op);
  const categories = [...new Set(children.flatMap((c) => c.categories))];
  return {
    condition_type: "RULE_TREE",
    condition_config: stringifyRuleTree(tree),
    categories: categories.length > 0 ? categories : ["CLIENT"],
  };
}

export function defaultTriggerRuleChildren(): RuleLeaf[] {
  return [
    { type: "TMI", config: { tranches: [30] }, categories: ["CLIENT"] },
    {
      type: "REVENUS_ANNUELS",
      config: { operator: "gte", montant: 60_000 },
      categories: ["CLIENT"],
    },
  ];
}

export function isTriggerRuleTreeValid(conditionConfig: string | null | undefined): boolean {
  const tree = parseRuleTree(conditionConfig);
  if (!tree || tree.children.length === 0) return false;
  return findFirstInvalidRuleLeafIndex(tree.children) == null;
}
