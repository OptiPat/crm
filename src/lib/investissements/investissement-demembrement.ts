/** SCPI démembrement : temporaire (échéance) ou viager (sans date de fin). */

import { formatCalendarDateFr, unixToDateInput } from "@/lib/dates/calendar-date";

export type DemembrementKind = "TEMPORAIRE" | "VIAGER";
export type DetentionDemembrement = "USUFRUIT" | "NUE_PROPRIETE";

const DUREE_LINE_RE = /^Durée:\s*/i;
const MODE_DETENTION_LINE_RE = /^Mode de détention:\s*/i;

export function parseDemembrementDuree(notes: string | null | undefined): {
  kind: DemembrementKind | null;
  annees: number | null;
} {
  const match = notes?.match(/Durée:\s*([^\n|]+)/i);
  if (!match) return { kind: null, annees: null };
  const raw = match[1].trim();
  if (raw.toLowerCase().includes("viager")) {
    return { kind: "VIAGER", annees: null };
  }
  const years = raw.match(/(\d+)/);
  if (years) {
    return { kind: "TEMPORAIRE", annees: parseInt(years[1], 10) };
  }
  return { kind: null, annees: null };
}

export function detectDemembrementKind(input: {
  typeProduit: string;
  hasDateFin: boolean;
  notes?: string | null;
}): DemembrementKind {
  if (input.typeProduit !== "SCPI_DEMEMBREMENT") {
    return "TEMPORAIRE";
  }
  const parsed = parseDemembrementDuree(input.notes);
  if (parsed.kind === "VIAGER") return "VIAGER";
  if (parsed.kind === "TEMPORAIRE" || input.hasDateFin) return "TEMPORAIRE";
  return "TEMPORAIRE";
}

export function parseModeDetention(
  notes: string | null | undefined
): DetentionDemembrement | null {
  const match = notes?.match(/Mode de détention:\s*([^\n|]+)/i);
  if (!match) return null;
  const raw = match[1].trim().toUpperCase();
  if (
    raw === "US" ||
    raw === "USU" ||
    raw === "USUFRUIT" ||
    raw.includes("USUFRUIT")
  ) {
    return "USUFRUIT";
  }
  if (
    raw === "NP" ||
    raw.includes("NUE") && raw.includes("PROP")
  ) {
    return "NUE_PROPRIETE";
  }
  return null;
}

export function stripModeDetentionFromNotes(notes: string): string {
  return notes
    .split("\n")
    .filter((line) => !MODE_DETENTION_LINE_RE.test(line.trim()))
    .join("\n")
    .trim();
}

export function stripDemembrementDureeFromNotes(notes: string): string {
  return notes
    .split("\n")
    .filter((line) => !DUREE_LINE_RE.test(line.trim()))
    .join("\n")
    .trim();
}

/** Retire les lignes structurées démembrement (durée + mode) des notes libres. */
export function stripStructuredDemembrementFromNotes(notes: string): string {
  return stripModeDetentionFromNotes(stripDemembrementDureeFromNotes(notes));
}

export function upsertModeDetentionInNotes(
  notes: string,
  mode: DetentionDemembrement | null
): string {
  const base = stripModeDetentionFromNotes(notes);
  if (!mode) return base;
  const label = mode === "USUFRUIT" ? "Usufruit" : "Nue-propriété";
  const line = `Mode de détention: ${label}`;
  return base ? `${base}\n${line}` : line;
}

export function upsertDemembrementDureeInNotes(
  notes: string,
  kind: DemembrementKind,
  annees?: number | null
): string {
  const base = stripDemembrementDureeFromNotes(notes);
  if (kind === "VIAGER") {
    return base ? `${base}\nDurée: viager` : "Durée: viager";
  }
  if (annees != null && annees > 0) {
    const line = `Durée: ${annees} ans`;
    return base ? `${base}\n${line}` : line;
  }
  return base;
}

/** Ajoute N années à un champ `YYYY-MM-DD` (calendrier UTC, comme dateFieldToIso). */
export function addYearsToDateInput(dateInput: string, years: number): string {
  if (!dateInput.trim() || years <= 0) return "";
  const [year, month, day] = dateInput.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year + years}-${pad(month)}-${pad(day)}`;
}

export function yearsBetweenDateInputs(
  startInput: string,
  endInput: string
): number | null {
  if (!startInput.trim() || !endInput.trim()) return null;
  const [y1, m1, d1] = startInput.split("-").map(Number);
  const [y2, m2, d2] = endInput.split("-").map(Number);
  if (
    !Number.isFinite(y1) ||
    !Number.isFinite(y2) ||
    !Number.isFinite(m1) ||
    !Number.isFinite(m2)
  ) {
    return null;
  }
  let years = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) years -= 1;
  return years > 0 ? years : null;
}

/** Libellé court pour synthèses (rapport CIF, etc.) : « viager » ou « temporaire N ans ». */
export function formatDemembrementDureeLabel(input: {
  type_produit: string;
  notes?: string | null;
  date_fin_demembrement?: number | null;
  date_souscription?: number | null;
}): string | null {
  if (input.type_produit !== "SCPI_DEMEMBREMENT") return null;

  const parsed = parseDemembrementDuree(input.notes);
  if (parsed.kind === "VIAGER") return "viager";

  const kind = detectDemembrementKind({
    typeProduit: input.type_produit,
    hasDateFin: input.date_fin_demembrement != null,
    notes: input.notes,
  });
  if (kind === "VIAGER") return "viager";

  if (parsed.annees != null && parsed.annees > 0) {
    return `temporaire ${parsed.annees} ans`;
  }

  if (input.date_souscription != null && input.date_fin_demembrement != null) {
    const years = yearsBetweenDateInputs(
      unixToDateInput(input.date_souscription),
      unixToDateInput(input.date_fin_demembrement)
    );
    if (years != null && years > 0) {
      return `temporaire ${years} ans`;
    }
  }

  if (input.date_fin_demembrement != null) {
    const fin = formatCalendarDateFr(input.date_fin_demembrement);
    return fin ? `temporaire fin ${fin}` : "temporaire";
  }

  return parsed.kind === "TEMPORAIRE" ? "temporaire" : null;
}
