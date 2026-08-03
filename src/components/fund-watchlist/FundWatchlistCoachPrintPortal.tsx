import { createPortal } from "react-dom";
import { FundWatchlistCoachLegalNotice } from "@/components/fund-watchlist/FundWatchlistCoachLegalNotice";
import { FundWatchlistCoachMarkdown } from "@/lib/fund-watchlist/fund-watchlist-coach-markdown";
import type { FundWatchlistCoachPrintDocument } from "@/lib/fund-watchlist/fund-watchlist-coach-print";

type Props = {
  printDoc: FundWatchlistCoachPrintDocument | null;
};

function FundWatchlistCoachPrintPortalInner({ printDoc }: { printDoc: FundWatchlistCoachPrintDocument }) {
  const generatedLabel = new Date(printDoc.report.generated_at * 1000).toLocaleString("fr-FR");
  return (
    <div id="coach-print-portal" aria-hidden>
      <article className="coach-print-doc">
        <header className="coach-print-header">
          <h1 className="coach-print-title">Rapport Coach Patrimonial</h1>
          <p className="coach-print-subtitle">
            Veille fonds — {printDoc.report.favorite_count} favori(s) — généré le {generatedLabel}
          </p>
        </header>
        {printDoc.report.warnings.length > 0 && (
          <section className="coach-print-warnings">
            <h2 className="coach-print-warnings-title">Avertissements collecte</h2>
            <ul>
              {printDoc.report.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </section>
        )}
        <section className="coach-print-body">
          <FundWatchlistCoachMarkdown markdown={printDoc.report.markdown} />
        </section>
        <FundWatchlistCoachLegalNotice variant="print" />
      </article>
    </div>
  );
}

/** Portail d'impression — hors #root pour window.print → PDF. */
export function FundWatchlistCoachPrintPortal({ printDoc }: Props) {
  if (!printDoc) return null;
  return createPortal(
    <FundWatchlistCoachPrintPortalInner printDoc={printDoc} />,
    globalThis.document.body
  );
}
