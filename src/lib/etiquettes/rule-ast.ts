/** Arbre de règles v1 — aligné sur `etiquette_rule_ast.rs`. */

export type RuleOp = "and" | "or";

export interface RuleLeaf {
  type: string;
  config: Record<string, unknown>;
  categories: string[];
}

export interface RuleTree {
  v: 1;
  op: RuleOp;
  children: RuleLeaf[];
}

export function isRuleTreeConfig(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  try {
    const p = JSON.parse(raw) as { v?: number; op?: string; children?: unknown[] };
    return p.v === 1 && Array.isArray(p.children);
  } catch {
    return false;
  }
}

export function parseRuleTree(raw: string | null | undefined): RuleTree | null {
  if (!isRuleTreeConfig(raw)) return null;
  try {
    return JSON.parse(raw!) as RuleTree;
  } catch {
    return null;
  }
}

export function buildRuleTree(children: RuleLeaf[], op: RuleOp = "and"): RuleTree {
  return { v: 1, op, children };
}

export function stringifyRuleTree(tree: RuleTree): string {
  return JSON.stringify(tree);
}

/** Passe en mode RULE_TREE pour sauvegarde backend. */
export function toRuleTreeSave(
  op: RuleOp,
  children: RuleLeaf[]
): { auto_condition_type: "RULE_TREE"; auto_condition_config: string; auto_categories: string } {
  const tree = buildRuleTree(children, op);
  const allCats = [...new Set(children.flatMap((c) => c.categories))];
  return {
    auto_condition_type: "RULE_TREE",
    auto_condition_config: stringifyRuleTree(tree),
    auto_categories: JSON.stringify(allCats),
  };
}

export function leafFromLegacy(
  type: string,
  config: Record<string, unknown>,
  categories: string[]
): RuleLeaf {
  return { type, config, categories };
}
