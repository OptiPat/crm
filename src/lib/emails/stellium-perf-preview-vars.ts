export function templateUsesStelliumPerfVariables(
  ...parts: (string | null | undefined)[]
): boolean {
  const hay = parts.filter(Boolean).join("\n");
  return /\{\{perf_resume(_html)?\}\}|\{\{perf_intro_(tu|vous)\}\}/.test(hay);
}

export function isStelliumPerfQueueItem(item: { etiquette_nom?: string | null }): boolean {
  return (item.etiquette_nom ?? "").includes("Performance AV/PER Stellium");
}

export function parseStelliumPerfCampaignVariables(
  raw: string | null | undefined
): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.perf_resume !== "string" && typeof parsed.perf_resume_html !== "string") {
      return {};
    }
    const out: Record<string, string> = {};
    for (const key of [
      "periode",
      "perf_intro_tu",
      "perf_intro_vous",
      "perf_resume",
      "perf_resume_html",
      "beneficiary_prenom",
      "beneficiary_nom",
    ] as const) {
      const v = parsed[key];
      if (typeof v === "string") out[key] = v;
    }
    if (typeof parsed.contrat_count === "number") {
      out.contrat_count = String(parsed.contrat_count);
    }
    if (parsed.is_proxy_for_minor === true) {
      out.is_proxy_for_minor = "true";
    }
    return out;
  } catch {
    return {};
  }
}
