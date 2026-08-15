import { Share2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { formatShortEuro } from "./client-preview-format";
import { useClientPreviewOverlayPortal } from "./client-preview-overlay";
import { CP } from "./client-preview-theme";
import {
  pieSlicePaths,
  syntheseValoKindPrefix,
  type SynthesePdfModel,
} from "@/lib/espace-client/synthese-patrimoniale-pdf";
import "./synthese-preview.css";

function PreviewPie({
  slices,
}: {
  slices: SynthesePdfModel["charts"][number]["slices"];
}) {
  const paths = pieSlicePaths(
    slices.map((slice) => ({ percent: slice.percent, color: slice.color }))
  );
  return (
    <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden>
      {paths.map((path) => (
        <path key={path.d} d={path.d} fill={path.color} />
      ))}
    </svg>
  );
}

function PreviewDocument({ model }: { model: SynthesePdfModel }) {
  return (
    <article className="synthese-preview-doc">
      <header className="synthese-preview-header">
        <div>
          <p className="synthese-preview-date">{model.generatedLabel}</p>
          {model.clientName ? (
            <h1 className="synthese-preview-title">{model.clientName}</h1>
          ) : null}
          <p className="synthese-preview-subtitle">{model.subtitle}</p>
        </div>
        {model.logoUrl ? (
          <img className="synthese-preview-logo" src={model.logoUrl} alt="" />
        ) : null}
      </header>
      {model.totalCentimes > 0 ? (
        <p className="synthese-preview-total">
          Patrimoine total estimé {formatShortEuro(model.totalCentimes)}
        </p>
      ) : null}
      {model.charts.length > 0 ? (
        <div className="synthese-preview-charts">
          {model.charts.map((chart) => (
            <section key={chart.title} className="synthese-preview-chart">
              <h2>{chart.title}</h2>
              <div className="synthese-preview-chart-body">
                <PreviewPie slices={chart.slices} />
                <ul className="synthese-preview-legend">
                  {chart.slices.map((slice) => (
                    <li key={slice.name}>
                      <span>
                        <span
                          className="synthese-preview-swatch"
                          style={{ background: slice.color }}
                        />
                        {slice.name}
                      </span>
                      <span>
                        {slice.percent} % · {formatShortEuro(slice.valueCentimes)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      ) : null}
      {model.groups.map((group) => (
        <section key={group.category} className="synthese-preview-group">
          <h2>{group.category}</h2>
          {group.items.map((item) => (
            <div key={item.id} className="synthese-preview-row">
              <div className="synthese-preview-row-main">
                <div>
                  <p className="synthese-preview-row-title">{item.title}</p>
                  {item.subtitle ? (
                    <p className="synthese-preview-meta">{item.subtitle}</p>
                  ) : null}
                </div>
                <div className="synthese-preview-row-end">
                  <p className="synthese-preview-amount">
                    {formatShortEuro(item.amountCentimes)}
                  </p>
                  {item.encoursDateLabel ? (
                    <p className="synthese-preview-meta">{item.encoursDateLabel}</p>
                  ) : null}
                  {item.originDateLabel ? (
                    <p className="synthese-preview-meta">{item.originDateLabel}</p>
                  ) : null}
                </div>
              </div>
              {item.valorisations.length > 0 ? (
                <ul className="synthese-preview-valos">
                  {item.valorisations.map((valo) => {
                    const prefix = syntheseValoKindPrefix(valo.kind);
                    return (
                      <li key={`${valo.kind}-${valo.dateLabel}-${valo.montantCentimes}`}>
                        <span>
                          {prefix ? `${prefix} · ${valo.dateLabel}` : valo.dateLabel}
                        </span>
                        <span>{formatShortEuro(valo.montantCentimes)}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ))}
      {model.legalLines.length > 0 ? (
        <footer className="synthese-preview-legal">
          {model.legalLines.map((line, index) => (
            <p key={`${index}-${line.slice(0, 24)}`}>{line}</p>
          ))}
        </footer>
      ) : null}
    </article>
  );
}

export function SynthesePatrimonialePreview({
  model,
  saving,
  ready,
  onClose,
  onShare,
}: {
  model: SynthesePdfModel;
  saving?: boolean;
  ready?: boolean;
  onClose: () => void;
  onShare: () => void;
}) {
  const overlayPortal = useClientPreviewOverlayPortal();
  const inFrame = overlayPortal != null;
  const layer = (
    <div
      className={`cp-layer ${inFrame ? "absolute" : "fixed"} inset-0 z-50 flex flex-col bg-[var(--cp-bg)]`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="synthese-preview-heading"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--cp-line)] px-3 py-2">
        <button
          type="button"
          className="rounded-lg p-2 text-[var(--cp-ink-muted)]"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
        <p id="synthese-preview-heading" className={`${CP.body} min-w-0 truncate`}>
          Aperçu
        </p>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm text-[var(--cp-ink)] disabled:opacity-60"
          disabled={saving || !ready}
          onClick={onShare}
        >
          <Share2 className="h-4 w-4" aria-hidden />
          Partager
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <PreviewDocument model={model} />
      </div>
    </div>
  );
  return createPortal(layer, overlayPortal ?? document.body);
}
