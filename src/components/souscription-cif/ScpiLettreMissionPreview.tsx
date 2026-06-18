import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  cifDocumentBodyClass,
  cifDocumentBodyProseClass,
  cifDocumentBodyTextClass,
  cifDocumentFooterClass,
  cifDocumentPageClass,
  cifDocumentPreambleTitleClass,
  cifDocumentSectionTitleClass,
  cifDocumentTitleClass,
} from "@/lib/souscription-cif/document-page-layout";
import { cn } from "@/lib/utils";
import type {
  ScpiLmPagePreview,
  ScpiLettreMissionPreview,
} from "@/lib/souscription-cif/render-template";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnnexesScpiCostsTable } from "@/components/souscription-cif/AnnexesScpiCostsTable";
import { AnnexesScpiObjectifsPatrimoniauxTable } from "@/components/souscription-cif/AnnexesScpiObjectifsPatrimoniauxTable";
import { AnnexesScpiCaracteristiquesOperationTable } from "@/components/souscription-cif/AnnexesScpiCaracteristiquesOperationTable";
import { AnnexesScpiHorizonProfilTable } from "@/components/souscription-cif/AnnexesScpiHorizonProfilTable";
import { AnnexesScpiOrigineFondsSection } from "@/components/souscription-cif/AnnexesScpiOrigineFondsSection";
import { AnnexesScpiProsConsTable } from "@/components/souscription-cif/AnnexesScpiProsConsTable";
import { ScpiAmfRiskScaleTable } from "@/components/souscription-cif/ScpiAmfRiskScaleTable";
import { ScpiLmInstrumentsTable } from "@/components/souscription-cif/ScpiLmInstrumentsTable";
import { RmRecapTable } from "@/components/souscription-cif/RmRecapTable";
import { ScpiLmSignatureBlock } from "@/components/souscription-cif/ScpiLmSignatureBlock";
import { CifPreviewSegments } from "@/components/souscription-cif/CifPreviewSegments";
import { CifProse } from "@/components/souscription-cif/CifProse";
export function ScpiLmBodyContent({
  page,
  onMissingVariableClick,
}: {
  page: ScpiLmPagePreview;
  onMissingVariableClick?: (key: string) => void;
}) {
  return (
    <>
      {page.headerLeft && page.headerRight && (
        <div className="mb-[10mm] flex items-start justify-between gap-[8mm]">
          <div className="min-w-0 text-left leading-snug">
            {page.headerLeft.map((line, i) => (
              <p key={i} className={i > 0 ? "mt-0.5" : undefined}>
                <CifPreviewSegments segments={line} onMissingVariableClick={onMissingVariableClick} />
              </p>
            ))}
          </div>
          <div className="min-w-0 shrink-0 text-right leading-snug">
            {page.headerRight.map((line, i) => (
              <p key={i} className={i > 0 ? "mt-0.5" : undefined}>
                <CifPreviewSegments segments={line} onMissingVariableClick={onMissingVariableClick} />
              </p>
            ))}
          </div>
        </div>
      )}

      {page.title && <h2 className={cifDocumentTitleClass}>{page.title}</h2>}

      {page.bodySegments.length > 0 && (
        <CifProse
          className={cifDocumentBodyProseClass}
          segments={page.bodySegments}
          onMissingVariableClick={onMissingVariableClick}
        />
      )}

      {page.centeredSectionTitle && (
        <h3
          className={cn(
            cifDocumentSectionTitleClass,
            page.bodySegments.length > 0 && "mt-[9mm]"
          )}
        >
          {page.centeredSectionTitle}
        </h3>
      )}

      {page.centeredPreambleTitle && (
        <h3 className={cifDocumentPreambleTitleClass}>{page.centeredPreambleTitle}</h3>
      )}

      {page.bodySegmentsContinuation && page.bodySegmentsContinuation.length > 0 && (
        <CifProse
          className={cifDocumentBodyProseClass}
          segments={page.bodySegmentsContinuation}
          onMissingVariableClick={onMissingVariableClick}
        />
      )}

      {page.rapportRecapRows && page.rapportRecapRows.length > 0 && (
        <>
          <RmRecapTable
            rows={page.rapportRecapRows}
            header={page.rapportRecapTableHeader}
            onMissingVariableClick={onMissingVariableClick}
            className={
              page.bodySegments.length === 0 && !page.title ? "mt-0" : undefined
            }
          />
          {page.bodySegmentsAfterRecapTable &&
            page.bodySegmentsAfterRecapTable.length > 0 && (
              <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
                <CifPreviewSegments
                  segments={page.bodySegmentsAfterRecapTable}
                  onMissingVariableClick={onMissingVariableClick}
                />
              </div>
            )}
          {page.showAnnexesCostsTable && <AnnexesScpiCostsTable rows={page.annexesCostsRows} />}
          {page.bodySegmentsAfterCostsTable &&
            page.bodySegmentsAfterCostsTable.length > 0 && (
              <div className={cn("mt-[3mm]", cifDocumentBodyProseClass)}>
                <CifPreviewSegments
                  segments={page.bodySegmentsAfterCostsTable}
                  onMissingVariableClick={onMissingVariableClick}
                />
              </div>
            )}
        </>
      )}

      {page.showInstrumentsTable && <ScpiLmInstrumentsTable />}

      {page.bodySegmentsAfterTable &&
        page.bodySegmentsAfterTable.length > 0 &&
        page.showAnnexesProsConsTable && (
          <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
            <CifPreviewSegments
              segments={page.bodySegmentsAfterTable}
              onMissingVariableClick={onMissingVariableClick}
            />
          </div>
        )}

      {page.showAnnexesObjectifsPatrimoniauxTable && (
        <>
          {page.bodySegmentsAfterTable && page.bodySegmentsAfterTable.length > 0 && (
            <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
              <CifPreviewSegments
                segments={page.bodySegmentsAfterTable}
                onMissingVariableClick={onMissingVariableClick}
              />
            </div>
          )}
          <AnnexesScpiObjectifsPatrimoniauxTable rows={page.annexesObjectifsPatrimoniauxRows} />
        </>
      )}

      {page.showAnnexesCaracteristiquesOperationTable && (
        <>
          {page.bodySegmentsAfterObjectifsPatrimoniauxTable &&
            page.bodySegmentsAfterObjectifsPatrimoniauxTable.length > 0 && (
              <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
                <CifPreviewSegments
                  segments={page.bodySegmentsAfterObjectifsPatrimoniauxTable}
                  onMissingVariableClick={onMissingVariableClick}
                />
              </div>
            )}
          <AnnexesScpiCaracteristiquesOperationTable
            sections={page.annexesCaracteristiquesOperationSections}
          />
        </>
      )}

      {page.showAnnexesHorizonProfilTable && (
        <>
          {page.bodySegmentsAfterCaracteristiquesOperationTable &&
            page.bodySegmentsAfterCaracteristiquesOperationTable.length > 0 && (
              <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
                <CifPreviewSegments
                  segments={page.bodySegmentsAfterCaracteristiquesOperationTable}
                  onMissingVariableClick={onMissingVariableClick}
                />
              </div>
            )}
          <AnnexesScpiHorizonProfilTable rows={page.annexesHorizonProfilRows} />
        </>
      )}

      {page.showAnnexesOrigineFondsSection && page.annexesOrigineFondsView && (
        <>
          <AnnexesScpiOrigineFondsSection
            view={page.annexesOrigineFondsView}
            onMissingVariableClick={onMissingVariableClick}
          />
          {page.bodySegmentsAfterOrigineFonds && page.bodySegmentsAfterOrigineFonds.length > 0 && (
            <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
              <CifPreviewSegments
                segments={page.bodySegmentsAfterOrigineFonds}
                onMissingVariableClick={onMissingVariableClick}
              />
            </div>
          )}
          {page.bodySegmentsSection6Intro && page.bodySegmentsSection6Intro.length > 0 && (
            <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
              <CifPreviewSegments
                segments={page.bodySegmentsSection6Intro}
                onMissingVariableClick={onMissingVariableClick}
              />
            </div>
          )}
          {page.bodySegmentsSection7 && page.bodySegmentsSection7.length > 0 && (
            <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
              <CifPreviewSegments
                segments={page.bodySegmentsSection7}
                onMissingVariableClick={onMissingVariableClick}
              />
            </div>
          )}
        </>
      )}

      {page.showAnnexesProsConsTable && (
        <AnnexesScpiProsConsTable rows={page.annexesProsConsRows} />
      )}

      {page.bodySegmentsAfterProsConsTable &&
        page.bodySegmentsAfterProsConsTable.length > 0 && (
          <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
            <CifPreviewSegments
              segments={page.bodySegmentsAfterProsConsTable}
              onMissingVariableClick={onMissingVariableClick}
            />
          </div>
        )}

      {page.annexesProsConsFiscalRows && page.annexesProsConsFiscalRows.length > 0 && (
        <AnnexesScpiProsConsTable rows={page.annexesProsConsFiscalRows} />
      )}

      {page.bodySegmentsAfterFiscalProsConsTable &&
        page.bodySegmentsAfterFiscalProsConsTable.length > 0 && (
          <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
            <CifPreviewSegments
              segments={page.bodySegmentsAfterFiscalProsConsTable}
              onMissingVariableClick={onMissingVariableClick}
            />
          </div>
        )}

      {page.showAmfRiskScale && (
        <ScpiAmfRiskScaleTable
          highlightedLevel={page.amfRiskHighlightLevel}
          investmentHorizon={page.amfRiskInvestmentHorizon}
          className="mt-[6mm]"
        />
      )}

      {page.bodySegmentsAfterTable &&
        page.bodySegmentsAfterTable.length > 0 &&
        !page.showAnnexesProsConsTable &&
        !page.showAnnexesObjectifsPatrimoniauxTable &&
        !page.showAnnexesCaracteristiquesOperationTable &&
        !page.showAnnexesHorizonProfilTable &&
        !page.showAnnexesOrigineFondsSection && (
          <div className={cn("mt-[4mm]", cifDocumentBodyProseClass)}>
            <CifPreviewSegments
              segments={page.bodySegmentsAfterTable}
              onMissingVariableClick={onMissingVariableClick}
            />
          </div>
        )}

      {page.signatureColumns && (
        <ScpiLmSignatureBlock
          left={page.signatureColumns.left}
          right={page.signatureColumns.right}
        />
      )}
    </>
  );
}

function ScpiLmPageContent({
  page,
  onMissingVariableClick,
}: {
  page: ScpiLmPagePreview;
  onMissingVariableClick?: (key: string) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[210mm]">
      <div className={cifDocumentPageClass}>
        <div
          lang="fr"
          className={cn(cifDocumentBodyClass, cifDocumentBodyTextClass, "relative")}
        >
          <ScpiLmBodyContent page={page} onMissingVariableClick={onMissingVariableClick} />
        </div>

        <div className={cifDocumentFooterClass}>
          <CifPreviewSegments
            segments={page.footerSegments}
            onMissingVariableClick={onMissingVariableClick}
          />
        </div>
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
  /** Libellé du document dans la barre d'aperçu. */
  documentLabel?: string;
  /** Réinitialise à la page 1 (ex. changement de client ou de document). */
  resetKey?: string | number;
  /** Clic sur une variable manquante → focus champ dossier. */
  onMissingVariableClick?: (key: string) => void;
};

/**
 * Aperçu d'un document CIF à pages figées (lettre de mission, convention RTO).
 *
 * Les documents à contenu variable (rapport de mission, annexes) utilisent
 * `CifPagedDocumentPreview` (pagination CSS native via Paged.js).
 */
export function ScpiLettreMissionPreview({
  preview,
  className,
  documentLabel = "Lettre de mission",
  resetKey,
  onMissingVariableClick,
}: ScpiLettreMissionPreviewProps) {
  const [pageIndex, setPageIndex] = useState(0);
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
            Aperçu — {documentLabel} — page {page.pageNumber}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {showNav && (
              <p className="text-xs text-muted-foreground">
                {safeIndex + 1} / {totalPages}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Format A4</p>
          </div>
        </div>

        <div className="flex justify-center p-4 sm:p-6">
          <ScpiLmPageContent page={page} onMissingVariableClick={onMissingVariableClick} />
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
