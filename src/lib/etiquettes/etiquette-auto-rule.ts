import type { Etiquette } from "@/lib/api/tauri-etiquettes";
import { isRuleTreeConfig } from "@/lib/etiquettes/rule-ast";

/** Étiquette avec règle auto (inline, RULE_TREE ou segment lié). */
export function etiquetteHasAutoRule(e: Etiquette): boolean {
  return (
    e.segment_id != null ||
    Boolean(e.auto_condition_type?.trim()) ||
    isRuleTreeConfig(e.auto_condition_config)
  );
}
