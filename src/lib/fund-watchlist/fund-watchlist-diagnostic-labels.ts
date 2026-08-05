import type { FundDiagnostic, FundDiagnosticStatus } from "@/lib/fund-watchlist/fund-watchlist-diagnostic";
import {
  FUND_DIAGNOSTIC_SHORT_TERM_RESPIRATION_LABEL,
  FUND_DIAGNOSTIC_SHARPE_TRIGGER,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic";

/** Libellés orientés conseiller (hors jargon technique). */
export const FUND_DIAGNOSTIC_STATUS_USER_LABELS: Record<FundDiagnosticStatus, string> = {
  conserver: "Conserver",
  sous_surveillance: "À suivre",
  signal_arbitrage: "Arbitrage à étudier",
  inconnu: "Données insuffisantes",
};

const WEAK_HORIZONS_RE = /^Faiblesse sur (\d+) horizons \((.+)\)$/;
const DELTA_RE = /^Écart vs (.+) 1 an : ([−-]?[\d.]+) pt$/;

/** Traduit une raison technique en phrase lisible pour le CGP. */
export function humanizeDiagnosticReason(reason: string): string {
  if (reason === "Correction 1 mois avec YTD encore solide") {
    return "Baisse marquée sur 1 mois, mais YTD encore solide (correction à surveiller)";
  }
  if (reason === FUND_DIAGNOSTIC_SHARPE_TRIGGER) {
    return "Risque mal rémunéré (Sharpe ≤ 0) — renforce l'alerte ci-dessus";
  }
  if (reason === FUND_DIAGNOSTIC_SHORT_TERM_RESPIRATION_LABEL) {
    return "Respiration récente du marché (1 sem. à YTD) — sans alerte fondamentale seule";
  }
  const weak = reason.match(WEAK_HORIZONS_RE);
  if (weak) {
    const horizons = weak[2] ?? "";
    // Pas de seuil chiffré ici : il dépend de la volatilité du fonds (−5 % en actions, −1,5 % sur
    // un fonds prudent). L'annoncer en dur affichait un chiffre faux.
    return `Recul marqué sur ${weak[1]} horizon(s) : ${horizons}`;
  }
  const delta = reason.match(DELTA_RE);
  if (delta) {
    const ref = delta[1] ?? "la catégorie";
    const pts = delta[2] ?? "";
    return `Performance 1 an : ${pts} points vs ${ref}`;
  }
  if (reason.startsWith("1 an au-dessus de la référence")) {
    return reason.replace("1 an au-dessus de la référence", "Performance 1 an au-dessus de la catégorie");
  }
  if (reason.startsWith("Légèrement sous la référence")) {
    return reason.replace("Légèrement sous la référence", "Légèrement sous la catégorie");
  }
  if (reason.startsWith("Seuils ")) {
    return reason;
  }
  if (reason.startsWith("Dans la moyenne")) {
    return reason;
  }
  return reason;
}

export function formatDiagnosticInlineForUser(diagnostic: FundDiagnostic): string | null {
  if (diagnostic.status === "conserver" || diagnostic.status === "inconnu") {
    return null;
  }
  if (diagnostic.trigger_reasons.length === 0 && diagnostic.context_reasons.length === 0) {
    return null;
  }

  const status = FUND_DIAGNOSTIC_STATUS_USER_LABELS[diagnostic.status];
  const lines = [`**Lecture patrimoniale — ${status}**`];

  for (const reason of diagnostic.trigger_reasons) {
    lines.push(`- ${humanizeDiagnosticReason(reason)}`);
  }

  const context = diagnostic.context_reasons
    .map(humanizeDiagnosticReason)
    .filter((line) => !diagnostic.trigger_reasons.some((t) => humanizeDiagnosticReason(t) === line));

  if (context.length > 0) {
    lines.push(`- Bon à savoir : ${context.join(" · ")}`);
  }

  return lines.join("\n");
}

export function formatFundWatchlistDiagnosticSummaryForUser(
  counts: Record<FundDiagnosticStatus, number>
): string {
  return [
    "## Lecture patrimoniale — favoris",
    "",
    "Résumé chiffré (règles CRM) avant l'analyse qualitative ci-dessous :",
    "",
    `- **À suivre** : ${counts.sous_surveillance} fond(s) — sous-performance catégorie, faiblesse durable ou correction 1 mois (Sharpe ≤ 0 renforce l'argumentaire si alerte déjà active)`,
    `- **Arbitrage à étudier** : ${counts.signal_arbitrage}`,
    `- **Conserver** : ${counts.conserver}`,
    `- **Données insuffisantes** : ${counts.inconnu}`,
    "",
    "> La « Décision » générée par l'IA peut nuancer (ex. correction temporaire après forte hausse). La lecture patrimoniale indique les signaux chiffrés à trancher avec le dossier client.",
  ].join("\n");
}
