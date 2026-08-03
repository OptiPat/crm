import type { CompareResponse } from "@/lib/api/tauri-uc-comparator";
import { buildUcTechnicalAnalystNote } from "@/lib/fund-watchlist/uc-comparator-analyst-note";
import {
  buildUcComparisonNarrative,
  formatCriterionRawValue,
  formatCriterionWeightLabel,
  fundsInRankOrder,
  metricsForIsin,
  resolveCriterionWinners,
  scoreForFundOnCriterion,
} from "@/lib/fund-watchlist/uc-comparator-summary";
import { UC_TOP_HOLDINGS_DISPLAY } from "@/lib/fund-watchlist/uc-comparator-visual";

type Props = {
  response: CompareResponse;
  generatedAt: number;
};

function verdictLabel(verdict: CompareResponse["verdict"]): string {
  switch (verdict) {
    case "WINNER_DECLARED":
      return "Recommandation";
    case "TIE":
      return "Égalité";
    case "INSUFFICIENT_DATA":
      return "Données insuffisantes";
    case "CATEGORY_MISMATCH":
      return "Catégories différentes";
    default:
      return verdict;
  }
}

function shortName(nom: string): string {
  return nom.split(" ").slice(0, 3).join(" ");
}

function collectExpoLabels(
  response: CompareResponse,
  key: "geo" | "sectors"
): string[] {
  const labels = new Set<string>();
  for (const snap of response.exposition ?? []) {
    for (const slice of snap[key]) labels.add(slice.label);
  }
  return Array.from(labels).sort((a, b) => a.localeCompare(b, "fr"));
}

export function UcComparatorPrintContent({ response, generatedAt }: Props) {
  const ranked = fundsInRankOrder(response.results ?? []);
  const narrative = buildUcComparisonNarrative(response);
  const analystNote = buildUcTechnicalAnalystNote(response);
  const insufficientData = response.verdict === "INSUFFICIENT_DATA";
  const generatedLabel = new Date(generatedAt * 1000).toLocaleString("fr-FR");
  const geoLabels = collectExpoLabels(response, "geo");
  const sectorLabels = collectExpoLabels(response, "sectors");

  return (
    <article className="uc-comparator-print-doc">
      <header className="uc-comparator-print-header">
        <h1 className="uc-comparator-print-title">Comparatif UC</h1>
        <p className="uc-comparator-print-subtitle">
          {response.category ?? "Catégorie non renseignée"} — {ranked.length} fonds — généré le{" "}
          {generatedLabel} — moteur {response.scoring_version}
        </p>
        <p className="uc-comparator-print-meta">
          Confiance {Math.round((response.confidence_index ?? 0) * 100)} % —{" "}
          {verdictLabel(response.verdict)}
        </p>
      </header>

      {narrative && <p className="uc-comparator-print-lead">{narrative}</p>}
      {response.category_warning && (
        <p className="uc-comparator-print-note">{response.category_warning}</p>
      )}

      <section className="uc-comparator-print-section">
        <h2>{insufficientData ? "Fonds comparés" : "Classement"}</h2>
        <table className="uc-comparator-print-table">
          <thead>
            <tr>
              <th>Fonds</th>
              <th>ISIN</th>
              <th className="uc-comparator-print-num">Score</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((fund) => (
              <tr key={fund.isin}>
                <td>
                  {!insufficientData && `${fund.rank}. `}
                  {fund.nom}
                </td>
                <td className="uc-comparator-print-mono">{fund.isin}</td>
                <td className="uc-comparator-print-num">
                  {insufficientData ? "N/A" : `${fund.score_relative_total.toFixed(1)} / 100`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ranked.some((f) => f.alerts?.length) && (
          <ul className="uc-comparator-print-alerts">
            {ranked.flatMap((fund) =>
              (fund.alerts ?? []).map((alert, i) => (
                <li key={`${fund.isin}-${i}`}>
                  <strong>{shortName(fund.nom)}</strong> — {alert}
                </li>
              ))
            )}
          </ul>
        )}
      </section>

      {response.criteria.length > 0 && (
        <section className="uc-comparator-print-section">
          <h2>Détail critère par critère</h2>
          <table className="uc-comparator-print-table uc-comparator-print-table--criteria">
            <thead>
              <tr>
                <th>Critère</th>
                {ranked.map((fund) => (
                  <th key={fund.isin} className="uc-comparator-print-num">
                    {shortName(fund.nom)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resolveCriterionWinners(response).map(({ criterion }) => (
                <tr key={criterion.key} className={!criterion.available ? "uc-comparator-print-muted" : ""}>
                  <td>
                    <div>{criterion.label}</div>
                    <div className="uc-comparator-print-caption">
                      {formatCriterionWeightLabel(criterion, response.criteria)}
                    </div>
                  </td>
                  {ranked.map((fund) => {
                    const relScore = scoreForFundOnCriterion(
                      criterion,
                      response.fund_order ?? [],
                      fund.isin
                    );
                    const raw = formatCriterionRawValue(
                      criterion.key,
                      metricsForIsin(response.metrics ?? [], fund.isin)
                    );
                    return (
                      <td key={fund.isin} className="uc-comparator-print-num">
                        <div>{raw}</div>
                        {criterion.available && relScore != null && (
                          <div className="uc-comparator-print-caption">score {relScore.toFixed(0)}/100</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(response.exposition ?? []).some((e) => (e.holdings?.length ?? 0) > 0) && (
        <section className="uc-comparator-print-section">
          <h2>Principales lignes du portefeuille</h2>
          <table className="uc-comparator-print-table">
            <thead>
              <tr>
                <th>#</th>
                {ranked.map((fund) => (
                  <th key={fund.isin}>{shortName(fund.nom)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: UC_TOP_HOLDINGS_DISPLAY }, (_, rowIndex) => (
                <tr key={rowIndex}>
                  <td>{rowIndex + 1}</td>
                  {ranked.map((fund) => {
                    const holding = response.exposition?.find((e) => e.isin === fund.isin)
                      ?.holdings?.[rowIndex];
                    return (
                      <td key={fund.isin}>
                        {holding
                          ? `${holding.label} (${holding.weight_percent.toFixed(1)} %)`
                          : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {geoLabels.length > 0 && (
        <section className="uc-comparator-print-section">
          <h2>Zone géographique</h2>
          <table className="uc-comparator-print-table">
            <thead>
              <tr>
                <th>Zone</th>
                {ranked.map((fund) => (
                  <th key={fund.isin} className="uc-comparator-print-num">
                    {shortName(fund.nom)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {geoLabels.map((label) => (
                <tr key={label}>
                  <td>{label}</td>
                  {ranked.map((fund) => {
                    const snap = response.exposition?.find((e) => e.isin === fund.isin);
                    const weight = snap?.geo.find((s) => s.label === label)?.weight_percent;
                    return (
                      <td key={fund.isin} className="uc-comparator-print-num">
                        {weight != null ? `${weight.toFixed(1)} %` : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {sectorLabels.length > 0 && (
        <section className="uc-comparator-print-section">
          <h2>Secteur d&apos;activité</h2>
          <table className="uc-comparator-print-table">
            <thead>
              <tr>
                <th>Secteur</th>
                {ranked.map((fund) => (
                  <th key={fund.isin} className="uc-comparator-print-num">
                    {shortName(fund.nom)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sectorLabels.map((label) => (
                <tr key={label}>
                  <td>{label}</td>
                  {ranked.map((fund) => {
                    const snap = response.exposition?.find((e) => e.isin === fund.isin);
                    const weight = snap?.sectors.find((s) => s.label === label)?.weight_percent;
                    return (
                      <td key={fund.isin} className="uc-comparator-print-num">
                        {weight != null ? `${weight.toFixed(1)} %` : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(response.exposition ?? []).some((e) => e.style_box) && (
        <section className="uc-comparator-print-section">
          <h2>Style Morningstar</h2>
          <table className="uc-comparator-print-table">
            <thead>
              <tr>
                <th>Fonds</th>
                <th>Style box</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((fund) => {
                const style = response.exposition?.find((e) => e.isin === fund.isin)?.style_box;
                return (
                  <tr key={fund.isin}>
                    <td>{shortName(fund.nom)}</td>
                    <td>{style?.label_fr ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {analystNote && (
        <section className="uc-comparator-print-section">
          <h2>Note de synthèse technique</h2>
          {analystNote.sections.map((section) => (
            <div key={section.title} className="uc-comparator-print-note-block">
              <h3>{section.title}</h3>
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ))}
        </section>
      )}

      <footer className="uc-comparator-print-legal">
        <p className="uc-comparator-print-legal-title">Mentions</p>
        <p>
          Document généré automatiquement par Patrimoine CRM à partir des données watchlist et
          Boursorama. Scores relatifs dans le groupe comparé — ne constitue pas une recommandation
          d&apos;investissement. Validation conseiller requise avant toute décision client.
        </p>
      </footer>
    </article>
  );
}
