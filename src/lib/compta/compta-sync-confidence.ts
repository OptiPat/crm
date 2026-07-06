export type ComptaExtractConfidence = "low" | "medium" | "high";

export function comptaConfidenceBadgeClass(confidence: ComptaExtractConfidence): string {
  switch (confidence) {
    case "high":
      return "border-emerald-300 bg-emerald-100 text-emerald-800";
    case "medium":
      return "border-amber-300 bg-amber-100 text-amber-900";
    case "low":
      return "border-red-300 bg-red-100 text-red-800";
  }
}

export function comptaConfidenceInputClass(confidence: ComptaExtractConfidence): string {
  switch (confidence) {
    case "high":
      return "border-emerald-300 focus-visible:ring-emerald-400/40";
    case "medium":
      return "border-amber-300 focus-visible:ring-amber-400/40";
    case "low":
      return "border-red-400 focus-visible:ring-red-400/40";
  }
}
