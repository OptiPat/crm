import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CifDocumentFlow } from "@/components/souscription-cif/CifDocumentFlow";
import { Button } from "@/components/ui/button";
import { cifFlowFingerprint } from "@/lib/souscription-cif/cif-flow-sections";
import { renderCifPaged } from "@/lib/souscription-cif/cif-paged";
import type { ScpiLettreMissionPreview } from "@/lib/souscription-cif/render-template";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

type CifPagedDocumentPreviewProps = {
  preview: ScpiLettreMissionPreview;
  documentLabel: string;
  className?: string;
  /** Réinitialise le rendu (changement de client ou de document). */
  resetKey?: string | number;
  /** Clic sur une variable manquante → focus champ dossier. */
  onMissingVariableClick?: (key: string) => void;
};

/** Délai de stabilisation avant re-pagination (évite de relancer Paged.js à chaque frappe). */
const REPAGINATE_DEBOUNCE_MS = 220;

export function CifPagedDocumentPreview({
  preview,
  documentLabel,
  className,
  resetKey,
  onMissingVariableClick,
}: CifPagedDocumentPreviewProps) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const runIdRef = useRef(0);
  /** Sérialise les rendus Paged.js sur la cible partagée (pas de pagination concurrente). */
  const renderChainRef = useRef<Promise<void>>(Promise.resolve());

  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const pageIndexRef = useRef(0);
  pageIndexRef.current = pageIndex;
  const [isRendering, setIsRendering] = useState(true);
  const [failed, setFailed] = useState(false);

  const fingerprint = useMemo(() => cifFlowFingerprint(preview), [preview]);

  /** N'affiche qu'une page à la fois (les pages Paged.js sont rendues empilées). */
  const applyPageVisibility = useCallback((index: number) => {
    const target = targetRef.current;
    if (!target) return;
    const pages = target.querySelectorAll<HTMLElement>(".pagedjs_page");
    pages.forEach((pageEl, i) => {
      pageEl.style.display = i === index ? "" : "none";
    });
  }, []);

  useEffect(() => {
    const source = sourceRef.current;
    const target = targetRef.current;
    if (!source || !target) return;

    setIsRendering(true);
    setFailed(false);

    const handle = window.setTimeout(() => {
      const runId = ++runIdRef.current;
      renderChainRef.current = renderChainRef.current.then(async () => {
        if (runId !== runIdRef.current) return;
        cleanupRef.current?.();
        cleanupRef.current = null;
        try {
          const result = await renderCifPaged(source, target, { scopeToScreen: true });
          if (runId !== runIdRef.current) {
            result.cleanup();
            return;
          }
          cleanupRef.current = result.cleanup;
          setPageCount(result.pageCount);
          const clamped = Math.min(pageIndexRef.current, Math.max(0, result.pageCount - 1));
          if (clamped !== pageIndexRef.current) setPageIndex(clamped);
          applyPageVisibility(clamped);
        } catch (error) {
          console.error("Pagination Paged.js (aperçu CIF) :", error);
          if (runId === runIdRef.current) setFailed(true);
        } finally {
          if (runId === runIdRef.current) setIsRendering(false);
        }
      });
    }, REPAGINATE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [fingerprint, resetKey, applyPageVisibility]);

  // Réinitialise à la page 1 quand le document change.
  useEffect(() => {
    setPageIndex(0);
  }, [resetKey]);

  // Applique la visibilité quand l'utilisateur navigue.
  useEffect(() => {
    applyPageVisibility(pageIndex);
  }, [pageIndex, applyPageVisibility]);

  useEffect(
    () => () => {
      runIdRef.current += 1;
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (targetRef.current) targetRef.current.innerHTML = "";
    },
    []
  );

  useEffect(() => {
    const target = targetRef.current;
    if (!target || !onMissingVariableClick) return;

    const handleClick = (event: MouseEvent) => {
      const node = (event.target as HTMLElement | null)?.closest?.(
        "[data-cif-missing-key]"
      );
      const key = node?.getAttribute("data-cif-missing-key");
      if (key) {
        event.preventDefault();
        onMissingVariableClick(key);
      }
    };

    target.addEventListener("click", handleClick);
    return () => target.removeEventListener("click", handleClick);
  }, [onMissingVariableClick]);

  const safeIndex = Math.min(pageIndex, Math.max(0, pageCount - 1));
  const showNav = pageCount > 1;
  const goPrev = () => setPageIndex((i) => Math.max(0, i - 1));
  const goNext = () => setPageIndex((i) => Math.min(pageCount - 1, i + 1));

  return (
    <div className={cn("space-y-3", className)}>
      {showNav && (
        <PageNavControls
          safeIndex={safeIndex}
          totalPages={pageCount}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}

      <div className="overflow-hidden rounded-lg border bg-muted/40 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            Aperçu — {documentLabel}
            {pageCount > 0 && ` — page ${safeIndex + 1} / ${pageCount}`}
          </p>
          <div className="flex items-center gap-2">
            {isRendering && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Pagination…
              </span>
            )}
            <p className="text-xs text-muted-foreground">Format A4</p>
          </div>
        </div>

        <div className="relative flex justify-center bg-neutral-200/60 p-4 sm:p-6">
          {failed && (
            <p className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-200/80 text-sm text-muted-foreground">
              Impossible de paginer l&apos;aperçu. Réessayez après modification.
            </p>
          )}
          <div ref={targetRef} className="cif-paged-screen w-full" />
        </div>
      </div>

      {showNav && (
        <PageNavControls
          safeIndex={safeIndex}
          totalPages={pageCount}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}

      {/* Source hors écran : flux continu fragmenté par Paged.js. */}
      <div ref={sourceRef} hidden aria-hidden>
        <CifDocumentFlow preview={preview} />
      </div>
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
      <p className="text-xs text-muted-foreground">
        {safeIndex + 1} / {totalPages}
      </p>
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
