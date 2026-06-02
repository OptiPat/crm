export const FOYER_TYPE_LABELS: Record<string, string> = {
  COUPLE: "Couple",
  FAMILLE: "Couple avec enfant(s)",
  CELIBATAIRE: "Célibataire",
  DIVORCE: "Divorcé(e)",
  VEUF: "Veuf(ve)",
};

export function getFoyerTypeLabel(type: string): string {
  return FOYER_TYPE_LABELS[type] ?? type;
}

export function getFoyerTypeBadgeClass(type: string): string {
  switch (type) {
    case "COUPLE":
      return "bg-violet-100 text-violet-800 border-violet-200/80";
    case "FAMILLE":
      return "bg-blue-100 text-blue-800 border-blue-200/80";
    case "CELIBATAIRE":
      return "bg-slate-100 text-slate-700 border-slate-200/80";
    case "DIVORCE":
      return "bg-orange-100 text-orange-800 border-orange-200/80";
    case "VEUF":
      return "bg-stone-100 text-stone-700 border-stone-200/80";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function formatFoyerCurrencyEur(value?: number): string | null {
  if (value == null || value === 0) return null;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
