import { CifPreviewSegments } from "@/components/souscription-cif/CifPreviewSegments";
import type { SouscriptionPreviewSegment } from "@/lib/souscription-cif/render-template";
import {
  chunkRmRecapRowsForPaged,
  type RmRecapPagedChunk,
} from "@/lib/souscription-cif/rm-recap-table-split";
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
  const chunks = chunkRmRecapRowsForPaged(rows);

  if (chunks.length === 1 && chunks[0]?.kind === "table") {
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
      {header && <RmRecapTableHeader title={header} />}
      {chunks.map((chunk, index) => (
        <RmRecapChunkView
          key={chunkKey(chunk, index)}
          chunk={chunk}
          continuesFromAbove={index > 0 || Boolean(header)}
          continuesBelow={index < chunks.length - 1}
          onMissingVariableClick={onMissingVariableClick}
        />
      ))}
    </div>
  );
}

function RmRecapTableHeader({ title }: { title: string }) {
  return (
    <table className={recapTableClass}>
      <colgroup>
        <col className="w-[28%]" />
        <col className="w-[72%]" />
      </colgroup>
      <thead>
        <tr>
          <th
            colSpan={2}
            className="border border-neutral-400 bg-neutral-100 px-1.5 py-1.5 w-full text-center font-semibold [text-align-last:center]"
          >
            {title}
          </th>
        </tr>
      </thead>
    </table>
  );
}

function chunkKey(chunk: RmRecapPagedChunk<RmRecapTableRow>, index: number): string {
  if (chunk.kind === "isolated") return `isolated-${chunk.row.title}`;
  return `table-${chunk.rows.map((r) => r.title).join("|") || index}`;
}

function RmRecapChunkView({
  chunk,
  continuesFromAbove,
  continuesBelow,
  onMissingVariableClick,
}: {
  chunk: RmRecapPagedChunk<RmRecapTableRow>;
  continuesFromAbove: boolean;
  continuesBelow: boolean;
  onMissingVariableClick?: (key: string) => void;
}) {
  if (chunk.kind === "isolated") {
    return (
      <RmRecapIsolatedRow
        row={chunk.row}
        continuesFromAbove={continuesFromAbove}
        continuesBelow={continuesBelow}
        onMissingVariableClick={onMissingVariableClick}
      />
    );
  }

  return (
    <RecapTablePart
      rows={chunk.rows}
      continuesFromAbove={continuesFromAbove}
      continuesBelow={continuesBelow}
      onMissingVariableClick={onMissingVariableClick}
    />
  );
}

function RecapTablePart({
  rows,
  header,
  className,
  continuesFromAbove = false,
  continuesBelow = false,
  onMissingVariableClick,
}: {
  rows: RmRecapTableRow[];
  header?: string;
  className?: string;
  continuesFromAbove?: boolean;
  continuesBelow?: boolean;
  onMissingVariableClick?: (key: string) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <table
      className={cn(
        recapTableClass,
        continuesBelow && "cif-rm-recap-table-continued-below",
        continuesFromAbove && "cif-rm-recap-table-continued-above",
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
                continuesFromAbove && index === 0 && "border-t-0"
              )}
            >
              {row.title}
            </th>
            <td
              className={cn(
                recapContentCellClass,
                continuesFromAbove && index === 0 && "border-t-0"
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

/** Ligne longue — mini-table isolée (export PDF Paged.js). */
function RmRecapIsolatedRow({
  row,
  continuesFromAbove,
  continuesBelow,
  onMissingVariableClick,
}: {
  row: RmRecapTableRow;
  continuesFromAbove: boolean;
  continuesBelow: boolean;
  onMissingVariableClick?: (key: string) => void;
}) {
  return (
    <table
      className={cn(
        recapTableClass,
        "cif-rm-recap-isolated-table",
        continuesBelow && "cif-rm-recap-table-continued-below",
        continuesFromAbove && "cif-rm-recap-table-continued-above"
      )}
    >
      <colgroup>
        <col className="w-[28%]" />
        <col className="w-[72%]" />
      </colgroup>
      <tbody>
        <tr className="cif-rm-recap-isolated-row">
          <th
            className={cn(recapTitleCellClass, continuesFromAbove && "border-t-0", "align-top")}
          >
            {row.title}
          </th>
          <td className={cn(recapContentCellClass, continuesFromAbove && "border-t-0", "align-top p-0")}>
            <div className="cif-rm-recap-isolated-body px-1.5 py-1.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
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
