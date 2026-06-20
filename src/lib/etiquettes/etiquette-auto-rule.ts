import type { Etiquette } from "@/lib/api/tauri-etiquettes";
import { isRuleTreeConfig } from "@/lib/etiquettes/rule-ast";

/** Étiquette avec règle auto (inline, RULE_TREE ou segment lié). */
export function etiquetteHasAutoRule(
  e: Pick<Etiquette, "segment_id" | "auto_condition_type" | "auto_condition_config">
): boolean {
  return (
    e.segment_id != null ||
    Boolean(e.auto_condition_type?.trim()) ||
    isRuleTreeConfig(e.auto_condition_config)
  );
}
