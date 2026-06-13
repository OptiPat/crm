import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  cifDocumentBodyClass,
  cifDocumentBodyProseClass,
  cifDocumentBodyTextClass,
  cifDocumentFooterClass,
  cifDocumentPageClass,
  cifDocumentTitleClass,
} from "@/lib/souscription-cif/document-page-layout";
import { cn } from "@/lib/utils";
import type {
  ScpiLmPagePreview,
  ScpiLettreMissionPreview,
  SouscriptionPreviewSegment,
} from "@/lib/souscription-cif/render-template";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { ScpiLmInstrumentsTable } from "@/components/souscription-cif/ScpiLmInstrumentsTable";

function RenderSegments({ segments }: { segments: SouscriptionPreviewSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <span key={i}>{seg.value}</span>
        ) : seg.kind === "underline" ? (
          <span key={i} className="underline">
            {seg.value}
          </span>
        ) : (
          <mark
            key={i}
            className="rounded bg-amber-200/90 px-0.5 text-amber-950 not-italic"
            title={`Variable : ${seg.key}`}
          >
            [{seg.label}]
          </mark>
        )
      )}
    </>
  );
}

function ScpiLmBodyContent({ page }: { page: ScpiLmPagePreview }) {
  return (
    <>
      {page.pageNumber === 1 && page.headerLeft && page.headerRight && (
        <div className="mb-[10mm] flex items-start justify-between gap-[8mm]">
          <div className="min-w-0 text-left leading-snug">
            {page.headerLeft.map((line, i) => (
              <p key={i} className={i > 0 ? "mt-0.5" : undefined}>
                <RenderSegments segments={line} />
              </p>
            ))}
          </div>
          <p className="shrink-0 text-right leading-snug whitespace-nowrap">
            <RenderSegments segments={page.headerRight} />
          </p>
        </div>
      )}

      {page.title && <h2 className={cifDocumentTitleClass}>{page.title}</h2>}

      <div className={cifDocumentBodyProseClass}>
        <RenderSegments segments={page.bodySegments} />
      </div>

      {page.showInstrumentsTable && <ScpiLmInstrumentsTable />}

      {page.bodySegmentsAfterTable && page.bodySegmentsAfterTable.length > 0 && (
        <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
          <RenderSegments segments={page.bodySegmentsAfterTable} />
        </div>
      )}
    </>
  );
}

const OVERFLOW_PEEK_MAX_PX = 200;

function ScpiLmPageContent({
  page,
  onOverflowChange,
}: {
  page: ScpiLmPagePreview;
  onOverflowChange?: (overflows: boolean, overflowPx: number) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const onOverflowChangeRef = useRef(onOverflowChange);
  onOverflowChangeRef.current = onOverflowChange;
  const [overflowPx, setOverflowPx] = useState(0);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    const check = () => {
      const px = Math.max(0, Math.round(el.scrollHeight - el.clientHeight));
      setOverflowPx(px);
      onOverflowChangeRef.current?.(px > 2, px);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page]);

  const overflows = overflowPx > 2;
  const peekHeight = Math.min(overflowPx + 28, OVERFLOW_PEEK_MAX_PX);

  return (
    <div className="mx-auto w-full max-w-[210mm]">
      <div className={cifDocumentPageClass}>
        <div
          ref={bodyRef}
          data-cif-body
          lang="fr"
          className={cn(cifDocumentBodyClass, cifDocumentBodyTextClass, "relative")}
        >
          <ScpiLmBodyContent page={page} />

          {overflows && (
            <>
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-red-100/90 to-transparent"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-x-[12mm] bottom-0 z-20 flex items-end justify-center"
                aria-hidden
              >
                <span className="mb-0.5 rounded bg-red-600 px-2 py-0.5 text-[7pt] font-semibold uppercase tracking-wide text-white shadow-sm">
                  Limite zone corps A4
                </span>
              </div>
              <div
                className="pointer-events-none absolute inset-x-[8mm] bottom-0 z-20 border-b-2 border-dashed border-red-500"
                aria-hidden
              />
            </>
          )}
        </div>

        <div className={cifDocumentFooterClass}>
          <RenderSegments segments={page.footerSegments} />
        </div>
      </div>

      {overflows && (
        <div
          className={cn(
            "relative -mt-px overflow-hidden border-2 border-dashed border-red-400 border-t-0",
            "bg-[repeating-linear-gradient(-45deg,rgb(254_242_242)_0,rgb(254_242_242)_6px,rgb(254_226_226)_6px,rgb(254_226_226)_12px)]",
            "shadow-md"
          )}
          style={{ height: peekHeight }}
        >
          <p className="sticky top-0 z-10 border-b border-red-300 bg-red-100/95 px-[20mm] py-1.5 text-[8pt] font-semibold text-red-900">
            Contenu hors A4 — à repaginer ou raccourcir
            {overflowPx > OVERFLOW_PEEK_MAX_PX - 28 && (
              <span className="font-normal text-red-800/80">
                {" "}
                (aperçu tronqué, ~{Math.round(overflowPx * 0.26)} mm masqués au total)
              </span>
            )}
          </p>
          <div
            className={cn(
              cifDocumentBodyTextClass,
              "overflow-hidden px-[20mm] pb-3 text-red-950/90"
            )}
            style={{ marginTop: -overflowPx }}
          >
            <ScpiLmBodyContent page={page} />
          </div>
        </div>
      )}
    </div>
  );
}

function PageNavControls({
  safeIndex,
  totalPages,
  onPrev,
  onNext,
}: {
  safeIndex: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={safeIndex === 0}
        onClick={onPrev}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Page précédente
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={safeIndex >= totalPages - 1}
        onClick={onNext}
      >
        Page suivante
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

type ScpiLettreMissionPreviewProps = {
  preview: ScpiLettreMissionPreview;
  className?: string;
  /** Réinitialise à la page 1 (ex. changement de client). */
  resetKey?: string | number;
};

export function ScpiLettreMissionPreview({
  preview,
  className,
  resetKey,
}: ScpiLettreMissionPreviewProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageOverflows, setPageOverflows] = useState(false);
  const totalPages = preview.pages.length;
  const safeIndex = Math.min(pageIndex, Math.max(0, totalPages - 1));
  const page = preview.pages[safeIndex];

  useEffect(() => {
    setPageIndex(0);
  }, [resetKey]);

  useEffect(() => {
    if (pageIndex >= totalPages) {
      setPageIndex(Math.max(0, totalPages - 1));
    }
  }, [pageIndex, totalPages]);

  useEffect(() => {
    setPageOverflows(false);
  }, [page, preview]);

  if (!page) return null;

  const goPrev = () => setPageIndex((i) => Math.max(0, i - 1));
  const goNext = () => setPageIndex((i) => Math.min(totalPages - 1, i + 1));
  const showNav = totalPages > 1;

  return (
    <div className={cn("space-y-3", className)}>
      {showNav && (
        <PageNavControls
          safeIndex={safeIndex}
          totalPages={totalPages}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}

      <div className="overflow-hidden rounded-lg border bg-muted/40 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            Aperçu — Lettre de mission SCPI — page {page.pageNumber}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {pageOverflows && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-300 bg-amber-50 text-amber-950"
                title="Le texte dépasse la zone utile A4 : la partie masquée est affichée en rouge sous la feuille."
              >
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Déborde de l&apos;A4
              </Badge>
            )}
            {showNav && (
              <p className="text-xs text-muted-foreground">
                {safeIndex + 1} / {totalPages}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Format A4</p>
          </div>
        </div>

        <div className="flex justify-center p-4 sm:p-6">
          <ScpiLmPageContent
            page={page}
            onOverflowChange={(overflows) => setPageOverflows(overflows)}
          />
        </div>
      </div>

      {showNav && (
        <PageNavControls
          safeIndex={safeIndex}
          totalPages={totalPages}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}
    </div>
  );
}

/** @deprecated Utiliser ScpiLettreMissionPreview */
export { ScpiLettreMissionPreview as ScpiLettreMissionPage1Preview };
