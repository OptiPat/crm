import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CifDocumentFlow } from "@/components/souscription-cif/CifDocumentFlow";
import { CifPreviewSegments } from "@/components/souscription-cif/CifPreviewSegments";
import { ScpiLmBodyContent } from "@/components/souscription-cif/ScpiLettreMissionPreview";
import type { CifPrintDocument } from "@/lib/souscription-cif/cif-print-export";
import { renderCifPaged } from "@/lib/souscription-cif/cif-paged";
import { cifDocumentUsesPagination } from "@/lib/souscription-cif/cif-pagination-config";
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
  return createPortal(<CifPrintPortalInner documents={documents} />, document.body);
}

function CifPrintPortalInner({ documents }: { documents: CifPrintDocument[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paginatedCount = documents.filter((doc) =>
    cifDocumentUsesPagination(doc.id)
  ).length;
  const readyCountRef = useRef(0);

  const markPagedReady = useCallback(() => {
    readyCountRef.current += 1;
    if (readyCountRef.current >= paginatedCount && containerRef.current) {
      containerRef.current.dataset.pagedReady = "true";
    }
  }, [paginatedCount]);

  useEffect(() => {
    if (paginatedCount === 0 && containerRef.current) {
      containerRef.current.dataset.pagedReady = "true";
    }
  }, [paginatedCount]);

  return (
    <div id="cif-print-portal" ref={containerRef} data-paged-ready="false" aria-hidden>
      {documents.map((doc, docIndex) =>
        cifDocumentUsesPagination(doc.id) ? (
          <CifPagedPrintDocument
            key={doc.id}
            doc={doc}
            isFirst={docIndex === 0}
            onReady={markPagedReady}
          />
        ) : (
          <CifFixedPrintDocument key={doc.id} doc={doc} docIndex={docIndex} />
        )
      )}
    </div>
  );
}

/** Document paginé nativement par Paged.js (rapport de mission, annexes). */
function CifPagedPrintDocument({
  doc,
  isFirst,
  onReady,
}: {
  doc: CifPrintDocument;
  isFirst: boolean;
  onReady: () => void;
}) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const source = sourceRef.current;
      const target = targetRef.current;
      if (!source || !target) {
        onReady();
        return;
      }
      try {
        const result = await renderCifPaged(source, target);
        if (cancelled) {
          result.cleanup();
          return;
        }
        cleanupRef.current = result.cleanup;
      } catch (error) {
        console.error("Pagination Paged.js (impression CIF) :", error);
        // Repli : si Paged.js échoue, on imprime le contenu en flux continu
        // (non découpé en A4) plutôt qu'un document vide — aucun contenu perdu.
        if (!cancelled && target) {
          const fallback = source.cloneNode(true) as HTMLElement;
          fallback.removeAttribute("hidden");
          fallback.removeAttribute("aria-hidden");
          target.innerHTML = "";
          target.appendChild(fallback);
        }
      } finally {
        if (!cancelled) onReady();
      }
    })();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        ref={targetRef}
        className={cn("cif-print-paged", !isFirst && "cif-print-doc-start")}
      />
      <div ref={sourceRef} hidden aria-hidden>
        <CifDocumentFlow preview={doc.preview} />
      </div>
    </>
  );
}

/** Document à pages figées (lettre de mission, convention RTO). */
function CifFixedPrintDocument({
  doc,
  docIndex,
}: {
  doc: CifPrintDocument;
  docIndex: number;
}) {
  return (
    <>
      {doc.preview.pages.map((page, pageIndex) => (
        <article
          key={`${doc.id}-${page.pageNumber}`}
          className={cn(
            cifDocumentPageClass,
            "cif-print-page",
            docIndex > 0 && pageIndex === 0 && "cif-print-doc-start"
          )}
        >
          <div
            lang="fr"
            className={cn(cifDocumentBodyClass, cifDocumentBodyTextClass, "cif-print-body")}
          >
            <ScpiLmBodyContent page={page} />
          </div>
          <footer className={cifDocumentFooterClass}>
            <CifPreviewSegments segments={page.footerSegments} />
          </footer>
        </article>
      ))}
    </>
  );
}
