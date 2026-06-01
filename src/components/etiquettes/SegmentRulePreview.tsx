import { useEffect, useState } from "react";
import { Users, Loader2 } from "lucide-react";
import { previewSegmentRuleCount } from "@/lib/api/tauri-segments";
import { buildRuleTree, stringifyRuleTree, type RuleLeaf, type RuleOp } from "@/lib/etiquettes/rule-ast";

export function SegmentRulePreview({
  op,
  children,
  ruleJson,
  debounceMs = 400,
}: {
  op?: RuleOp;
  children?: RuleLeaf[];
  ruleJson?: string;
  debounceMs?: number;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const payload =
    ruleJson ??
    (children && children.length > 0
      ? stringifyRuleTree(buildRuleTree(children, op ?? "and"))
      : null);

  useEffect(() => {
    if (!payload) {
      setCount(null);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      previewSegmentRuleCount(payload)
        .then(setCount)
        .catch(() => setCount(null))
        .finally(() => setLoading(false));
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [payload, debounceMs]);

  if (!payload) return null;

  return (
    <p className="text-sm text-muted-foreground flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      ) : (
        <Users className="h-4 w-4 shrink-0 text-primary" />
      )}
      {loading ? (
        "Calcul des contacts concernés…"
      ) : count != null ? (
        <>
          <span className="font-medium text-foreground tabular-nums">{count}</span>
          contact{count !== 1 ? "s" : ""} correspondant{count !== 1 ? "s" : ""} à cette règle
        </>
      ) : (
        "Aperçu indisponible"
      )}
    </p>
  );
}
