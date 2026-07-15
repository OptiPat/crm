import { CifPreviewSegments } from "@/components/souscription-cif/CifPreviewSegments";
import type { SouscriptionPreviewSegment } from "@/lib/souscription-cif/render-template";
import { splitRmRecapRowsAtAnalyse } from "@/lib/souscription-cif/rm-recap-table-split";
import { cn } from "@/lib/utils";

export type RmRecapTableRow = {
  title: string;
  contentSegments: SouscriptionPreviewSegment[];
};

type RmRecapTableProps = {
  rows: RmRecapTableRow[];
  /** En-tête sur toute la largeur du tableau (ex. « TABLEAU RÉCAPITULATIF »). */
  header?: string;
  className?: string;
  onMissingVariableClick?: (key: string) => void;
};

const recapTableClass =
  "cif-rm-recap-table w-full table-fixed border-collapse text-left text-[8pt] leading-[1.25] text-neutral-900";

const recapTitleCellClass =
  "border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-semibold whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 [text-align-last:auto]";

const recapContentCellClass =
  "border border-neutral-400 px-1.5 py-1.5 align-top whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 [text-align-last:auto]";

export function RmRecapTable({
  rows,
  header,
  className,
  onMissingVariableClick,
}: RmRecapTableProps) {
  const { before, analyse, after } = splitRmRecapRowsAtAnalyse(rows);

  if (!analyse) {
    return (
      <RecapTablePart
        rows={rows}
        header={header}
        className={cn("mt-[4mm]", className)}
        onMissingVariableClick={onMissingVariableClick}
      />
    );
  }

  return (
    <div className={cn("cif-rm-recap-table-group mt-[4mm]", className)}>
      <RecapTablePart
        rows={before}
        header={header}
        continuesBelow
        onMissingVariableClick={onMissingVariableClick}
      />
      <RmRecapAnalyseRow row={analyse} onMissingVariableClick={onMissingVariableClick} />
      <RecapTablePart
        rows={after}
        continuesFromAnalyse
        onMissingVariableClick={onMissingVariableClick}
      />
    </div>
  );
}

function RecapTablePart({
  rows,
  header,
  className,
  continuesFromAnalyse = false,
  continuesBelow = false,
  onMissingVariableClick,
}: {
  rows: RmRecapTableRow[];
  header?: string;
  className?: string;
  continuesFromAnalyse?: boolean;
  continuesBelow?: boolean;
  onMissingVariableClick?: (key: string) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <table
      className={cn(
        recapTableClass,
        continuesBelow && "cif-rm-recap-table-continued-below",
        continuesFromAnalyse && "cif-rm-recap-table-continued-above",
        className
      )}
    >
      <colgroup>
        <col className="w-[28%]" />
        <col className="w-[72%]" />
      </colgroup>
      {header && (
        <thead>
          <tr>
            <th
              colSpan={2}
              className="border border-neutral-400 bg-neutral-100 px-1.5 py-1.5 w-full text-center font-semibold [text-align-last:center]"
            >
              {header}
            </th>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.title}>
            <th
              className={cn(
                recapTitleCellClass,
                continuesFromAnalyse && index === 0 && "border-t-0"
              )}
            >
              {row.title}
            </th>
            <td
              className={cn(
                recapContentCellClass,
                continuesFromAnalyse && index === 0 && "border-t-0"
              )}
            >
              <CifPreviewSegments
                segments={row.contentSegments}
                onMissingVariableClick={onMissingVariableClick}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Ligne « Analyse » — mini-table isolée (hors grand tableau récap).
 *
 * Paged.js supprime parfois une `<tr>` au milieu d'un grand `<table>` ; ici une
 * table d'une seule ligne évite ça. La grille CSS décale le verbatim dans la
 * colonne titre au saut de page — une cellule `<td>` fragmente correctement.
 */
function RmRecapAnalyseRow({
  row,
  onMissingVariableClick,
}: {
  row: RmRecapTableRow;
  onMissingVariableClick?: (key: string) => void;
}) {
  return (
    <table className={cn(recapTableClass, "cif-rm-recap-analyse-table")}>
      <colgroup>
        <col className="w-[28%]" />
        <col className="w-[72%]" />
      </colgroup>
      <tbody>
        <tr className="cif-rm-recap-analyse-row">
          <th className={cn(recapTitleCellClass, "border-t-0 align-top")}>{row.title}</th>
          <td className={cn(recapContentCellClass, "border-t-0 align-top p-0")}>
            <div className="cif-rm-recap-analyse-body px-1.5 py-1.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              <CifPreviewSegments
                segments={row.contentSegments}
                onMissingVariableClick={onMissingVariableClick}
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
