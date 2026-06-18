import { CifPreviewSegments } from "@/components/souscription-cif/CifPreviewSegments";
import { ScpiLmBodyContent } from "@/components/souscription-cif/ScpiLettreMissionPreview";
import { buildCifFlowSections } from "@/lib/souscription-cif/cif-flow-sections";
import { cifDocumentBodyTextClass } from "@/lib/souscription-cif/document-page-layout";
import type { ScpiLettreMissionPreview } from "@/lib/souscription-cif/render-template";
import { cn } from "@/lib/utils";

type CifDocumentFlowProps = {
  preview: ScpiLettreMissionPreview;
  onMissingVariableClick?: (key: string) => void;
};

/**
 * Rendu d'un document CIF en flux continu (sans découpage en pages).
 *
 * Destiné à être fragmenté par Paged.js : les sections sont séparées par des sauts
 * de page durs (`cif-page-break`), le pied de page est un élément courant répété
 * sur chaque page via `position: running()` (voir `cif-paged-css.ts`).
 */
export function CifDocumentFlow({ preview, onMissingVariableClick }: CifDocumentFlowProps) {
  const sections = buildCifFlowSections(preview);
  const footerSegments = sections[0]?.footerSegments ?? [];

  return (
    <div
      lang="fr"
      className={cn("cif-paged-flow", cifDocumentBodyTextClass)}
    >
      {/* Pied de page courant : DOIT être en tête du flux. Paged.js ne mémorise
          l'élément running (set.first) que sur les pages dont le fragment le
          contient ; placé en fin, il n'atterrit que sur la dernière page et
          n'apparaît donc pas sur les précédentes. En tête (display:none injecté
          par Paged.js), il est capté dès la page 1 puis cloné sur toutes. */}
      <div className="cif-running-footer cif-document-comfortaa font-comfortaa">
        <CifPreviewSegments segments={footerSegments} />
      </div>

      {sections.map((section, index) => (
        <section
          key={section.pageNumber}
          className={cn("cif-flow-section", index > 0 && "cif-page-break")}
        >
          <ScpiLmBodyContent
            page={section}
            onMissingVariableClick={onMissingVariableClick}
          />
        </section>
      ))}
    </div>
  );
}
