/** Codes jour stockés en JSON dans `email_envoi_jours_semaine` (étiquette ou déclencheur template). */
export type EmailEnvoiJourCode = "LUN" | "MAR" | "MER" | "JEU" | "VEN" | "SAM" | "DIM";

export const EMAIL_ENVOI_JOUR_OPTIONS: { code: EmailEnvoiJourCode; label: string }[] = [
  { code: "LUN", label: "Lun" },
  { code: "MAR", label: "Mar" },
  { code: "MER", label: "Mer" },
  { code: "JEU", label: "Jeu" },
  { code: "VEN", label: "Ven" },
  { code: "SAM", label: "Sam" },
  { code: "DIM", label: "Dim" },
];

const JOUR_ORDER: EmailEnvoiJourCode[] = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

const JOUR_LABELS: Record<EmailEnvoiJourCode, string> = {
  LUN: "lundi",
  MAR: "mardi",
  MER: "mercredi",
  JEU: "jeudi",
  VEN: "vendredi",
  SAM: "samedi",
  DIM: "dimanche",
};

function isJourCode(v: string): v is EmailEnvoiJourCode {
  return (JOUR_ORDER as string[]).includes(v);
}

function sortJours(days: EmailEnvoiJourCode[]): EmailEnvoiJourCode[] {
  return JOUR_ORDER.filter((d) => days.includes(d));
}

/** `null` = jour calendaire (J+N). Sinon liste des jours autorisés après J+N. */
export function parseEmailEnvoiJoursSemaine(
  raw: string | null | undefined
): EmailEnvoiJourCode[] | null {
  if (raw == null || !raw.trim()) return null;
  const t = raw.trim();
  if (t === "MARDI_JEUDI") return ["MAR", "JEU"];
  if (!t.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed)) return null;
    const days = parsed.filter((x): x is EmailEnvoiJourCode =>
      typeof x === "string" && isJourCode(x)
    );
    const sorted = sortJours(days);
    return sorted.length > 0 ? sorted : null;
  } catch {
    return null;
  }
}

/** Sérialise pour la base ; `null` ou `[]` → pas de report (jour calendaire). */
export function serializeEmailEnvoiJoursSemaine(
  days: EmailEnvoiJourCode[] | null
): string | null {
  if (!days || days.length === 0) return null;
  return JSON.stringify(sortJours(days));
}

export function emailEnvoiJoursSemaineLabel(
  raw: string | null | undefined
): string | null {
  const days = parseEmailEnvoiJoursSemaine(raw);
  if (!days || days.length === 0) return null;
  const labels = days.map((d) => JOUR_LABELS[d]);
  if (labels.length === 1) {
    return `prochain ${labels[0]} après le délai`;
  }
  const last = labels.pop();
  return `prochain ${labels.join(", ")} ou ${last} après le délai`;
}

export function toggleEmailEnvoiJour(
  current: EmailEnvoiJourCode[] | null,
  code: EmailEnvoiJourCode
): EmailEnvoiJourCode[] | null {
  const base = current ?? [];
  const next = base.includes(code)
    ? base.filter((d) => d !== code)
    : sortJours([...base, code]);
  return next.length > 0 ? next : null;
}
