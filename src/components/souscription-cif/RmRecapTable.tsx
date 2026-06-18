import { CifPreviewSegments } from "@/components/souscription-cif/CifPreviewSegments";
import type { SouscriptionPreviewSegment } from "@/lib/souscription-cif/render-template";
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

export function RmRecapTable({
  rows,
  header,
  className,
  onMissingVariableClick,
}: RmRecapTableProps) {
  return (
    <table
      className={cn(
        "cif-rm-recap-table mt-[4mm] w-full table-fixed border-collapse text-left text-[8pt] leading-[1.25] text-neutral-900",
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
        {rows.map((row) => (
          <tr key={row.title}>
            <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-semibold whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 [text-align-last:auto]">
              {row.title}
            </th>
            <td className="border border-neutral-400 px-1.5 py-1.5 align-top whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 [text-align-last:auto]">
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
