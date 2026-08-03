import { createPortal } from "react-dom";
import { UcComparatorPrintContent } from "@/components/fund-watchlist/UcComparatorPrintContent";
import type { UcComparatorPrintDocument } from "@/lib/fund-watchlist/uc-comparator-print";

type Props = {
  printDoc: UcComparatorPrintDocument | null;
};

/** Portail d'impression — hors #root pour window.print → PDF. */
export function UcComparatorPrintPortal({ printDoc }: Props) {
  if (!printDoc) return null;
  return createPortal(
    <div id="uc-comparator-print-portal" aria-hidden>
      <UcComparatorPrintContent
        response={printDoc.response}
        generatedAt={printDoc.generatedAt}
      />
    </div>,
    globalThis.document.body
  );
}
