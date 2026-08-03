import type { FundWatchlistEntry, FundWatchlistFavoritesReport } from "@/lib/api/tauri-fund-watchlist";
import { countDiagnosticsByStatus, type FundDiagnostic } from "@/lib/fund-watchlist/fund-watchlist-diagnostic";
import {
  formatDiagnosticInlineForUser,
  formatFundWatchlistDiagnosticSummaryForUser,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic-labels";

const DIAGNOSTIC_SNAPSHOT_KEY = "fund-watchlist-coach-diagnostic-snapshot";
const DIAGNOSTIC_INLINE_MARKERS = ["**Lecture patrimoniale", "**Diagnostic déterministe**"];
const FUND_SECTION_HEADER_RE = /^(?:###\s+)?([A-Z]{2}[A-Z0-9]{9}\d)\s+—\s+/;

type DiagnosticSnapshot = {
  entries: FundWatchlistEntry[];
  diagnostics: Record<string, FundDiagnostic>;
};

function reportHasDiagnosticInline(markdown: string): boolean {
  return DIAGNOSTIC_INLINE_MARKERS.some((marker) => markdown.includes(marker));
}

/** Injecte la lecture patrimoniale sous chaque en-tête fonds du rapport LLM. */
export function injectDiagnosticIntoCoachReport(
  markdown: string,
  diagnostics: Map<string, FundDiagnostic>
): string {
  if (reportHasDiagnosticInline(markdown)) return markdown;

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    output.push(line);

    const match = line.match(FUND_SECTION_HEADER_RE);
    if (!match) continue;

    const isin = match[1];
    const diagnostic = diagnostics.get(isin);
    if (!diagnostic) continue;

    const inline = formatDiagnosticInlineForUser(diagnostic);
    if (!inline) continue;

    const nextLine = (lines[i + 1] ?? "").trim();
    if (DIAGNOSTIC_INLINE_MARKERS.some((marker) => nextLine.startsWith(marker))) continue;

    output.push("", inline);
  }

  return output.join("\n");
}

export function formatFundWatchlistDiagnosticSummary(
  favorites: FundWatchlistEntry[],
  diagnostics: Map<string, FundDiagnostic>
): string {
  const favoriteDiagnostics = new Map<string, FundDiagnostic>();
  for (const entry of favorites) {
    const diagnostic = diagnostics.get(entry.isin);
    if (diagnostic) favoriteDiagnostics.set(entry.isin, diagnostic);
  }
  return formatFundWatchlistDiagnosticSummaryForUser(
    countDiagnosticsByStatus(favoriteDiagnostics)
  );
}

export function mergeCoachReportWithDiagnosticNarrative(
  report: FundWatchlistFavoritesReport,
  favoriteEntries: FundWatchlistEntry[],
  diagnostics: Map<string, FundDiagnostic>
): FundWatchlistFavoritesReport {
  if (reportHasDiagnosticInline(report.markdown)) return report;

  const summary = formatFundWatchlistDiagnosticSummary(favoriteEntries, diagnostics);
  const withInline = injectDiagnosticIntoCoachReport(report.markdown, diagnostics);

  return {
    ...report,
    markdown: `${summary}\n\n---\n\n${withInline}`,
  };
}

export function saveCoachDiagnosticSnapshot(
  favoriteEntries: FundWatchlistEntry[],
  diagnostics: Map<string, FundDiagnostic>
): void {
  const payload: DiagnosticSnapshot = {
    entries: favoriteEntries,
    diagnostics: Object.fromEntries(diagnostics),
  };
  sessionStorage.setItem(DIAGNOSTIC_SNAPSHOT_KEY, JSON.stringify(payload));
}

export function loadCoachDiagnosticSnapshot(): {
  entries: FundWatchlistEntry[];
  diagnostics: Map<string, FundDiagnostic>;
} | null {
  try {
    const raw = sessionStorage.getItem(DIAGNOSTIC_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DiagnosticSnapshot;
    return {
      entries: parsed.entries,
      diagnostics: new Map(Object.entries(parsed.diagnostics)),
    };
  } catch {
    return null;
  }
}

export function clearCoachDiagnosticSnapshot(): void {
  sessionStorage.removeItem(DIAGNOSTIC_SNAPSHOT_KEY);
}

// Réexport pour les tests
export { formatDiagnosticInlineForUser as formatDiagnosticInlineForCoachSection };
