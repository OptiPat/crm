import { useCallback, useEffect, useMemo, useState } from "react";
import { pageNeedsPagination } from "@/lib/souscription-cif/cif-pagination";
import {
  paginatePageFromEstimate,
  paginatePageFromLiveBody,
  previewContentFingerprint,
} from "@/lib/souscription-cif/cif-pagination-from-dom";
import type {
  ScpiLettreMissionPreview,
  ScpiLmPagePreview,
} from "@/lib/souscription-cif/render-template";

function renumberPages(pages: ScpiLmPagePreview[]): ScpiLmPagePreview[] {
  return pages.map((page, index) => ({ ...page, pageNumber: index + 1 }));
}

function pagesStructureKey(pages: ScpiLmPagePreview[]): string {
  return pages
    .map(
      (p) =>
        `${p.paginationSliceId ?? p.pageNumber}:${p.rapportRecapRows?.length ?? 0}:${
          p.bodySegments.length
        }`
    )
    .join("|");
}

function expandPagesProactively(pages: ScpiLmPagePreview[]): ScpiLmPagePreview[] {
  let result = pages;
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    const next: ScpiLmPagePreview[] = [];
    for (const page of result) {
      if (!pageNeedsPagination(page)) {
        next.push(page);
        continue;
      }
      const split = paginatePageFromEstimate(page);
      if (split.length > 1) {
        next.push(...split);
        changed = true;
      } else {
        next.push(page);
      }
    }
    result = renumberPages(next);
    if (!changed) break;
  }
  return result;
}

export function useCifExpandedPreview(
  rawPreview: ScpiLettreMissionPreview,
  enabled: boolean,
  resetKey?: string | number
) {
  const contentFingerprint = useMemo(
    () => previewContentFingerprint(rawPreview),
    [rawPreview]
  );

  const [displayPages, setDisplayPages] = useState<ScpiLmPagePreview[]>(() =>
    enabled ? expandPagesProactively(rawPreview.pages) : rawPreview.pages
  );

  // Recalcule à chaque modification de contenu (réduit ou augmente le nombre de pages).
  useEffect(() => {
    if (!enabled) {
      setDisplayPages(rawPreview.pages);
      return;
    }
    setDisplayPages(expandPagesProactively(rawPreview.pages));
  }, [contentFingerprint, resetKey, enabled, rawPreview.pages]);

  const expandedPreview = useMemo(
    () => ({ ...rawPreview, pages: displayPages }),
    [rawPreview, displayPages]
  );

  const paginateFromOverflow = useCallback(
    (displayIndex: number, bodyEl: HTMLElement) => {
      if (!enabled) return;

      setDisplayPages((prev) => {
        const page = prev[displayIndex];
        if (!page || !pageNeedsPagination(page)) return prev;

        const split = paginatePageFromLiveBody(page, bodyEl);
        if (split.length <= 1) return prev;

        const next = renumberPages([
          ...prev.slice(0, displayIndex),
          ...split,
          ...prev.slice(displayIndex + 1),
        ]);
        if (pagesStructureKey(next) === pagesStructureKey(prev)) return prev;
        return next;
      });
    },
    [enabled]
  );

  return { expandedPreview, paginateFromOverflow, contentFingerprint };
}
