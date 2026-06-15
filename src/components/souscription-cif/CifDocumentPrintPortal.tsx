import { createPortal } from "react-dom";
import { CifPreviewSegments } from "@/components/souscription-cif/CifPreviewSegments";
import { ScpiLmBodyContent } from "@/components/souscription-cif/ScpiLettreMissionPreview";
import type { CifPrintDocument } from "@/lib/souscription-cif/cif-print-export";
import {
  cifDocumentBodyClass,
  cifDocumentBodyTextClass,
  cifDocumentFooterClass,
  cifDocumentPageClass,
} from "@/lib/souscription-cif/document-page-layout";
import { cn } from "@/lib/utils";

type CifDocumentPrintPortalProps = {
  documents: CifPrintDocument[] | null;
};

/** Portail d'impression — rendu haute fidélité (window.print → Enregistrer en PDF). */
export function CifDocumentPrintPortal({ documents }: CifDocumentPrintPortalProps) {
  if (!documents?.length) return null;

  return createPortal(
    <div id="cif-print-portal" aria-hidden>
      {documents.flatMap((doc, docIndex) =>
        doc.preview.pages.map((page, pageIndex) => (
          <article
            key={`${doc.id}-${page.pageNumber}`}
            className={cn(
              cifDocumentPageClass,
              "cif-print-page",
              docIndex > 0 && pageIndex === 0 && "cif-print-doc-start"
            )}
          >
            <div lang="fr" className={cn(cifDocumentBodyClass, cifDocumentBodyTextClass)}>
              <ScpiLmBodyContent page={page} />
            </div>
            <footer className={cifDocumentFooterClass}>
              <CifPreviewSegments segments={page.footerSegments} />
            </footer>
          </article>
        ))
      )}
    </div>,
    document.body
  );
}
