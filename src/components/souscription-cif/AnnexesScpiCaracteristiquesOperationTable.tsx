import {
  ANNEXES_SCPI_CARACTERISTIQUES_OPERATION_SECTIONS,
  formatCaracteristiqueOperationCell,
  type AnnexesScpiCaracteristiquesCell,
  type AnnexesScpiCaracteristiquesSection,
} from "@/lib/souscription-cif/annexes-scpi-caracteristiques-operation-table";
import { cn } from "@/lib/utils";

type AnnexesScpiCaracteristiquesOperationTableProps = {
  sections?: ReadonlyArray<AnnexesScpiCaracteristiquesSection>;
  className?: string;
};

function ValueCell({ cell }: { cell: AnnexesScpiCaracteristiquesCell }) {
  if (cell.kind === "span-continue") return null;

  const isCheck = cell.kind === "check";
  const rowSpan = cell.kind === "text" ? cell.rowSpan : undefined;

  return (
    <td
      rowSpan={rowSpan}
      className={cn(
        "border border-neutral-400 px-1.5 py-1.5 align-top whitespace-pre-wrap [text-align-last:auto]",
        isCheck ? "text-center [text-align-last:center]" : "text-left"
      )}
    >
      {formatCaracteristiqueOperationCell(cell)}
    </td>
  );
}

export function AnnexesScpiCaracteristiquesOperationTable({
  sections = ANNEXES_SCPI_CARACTERISTIQUES_OPERATION_SECTIONS,
  className,
}: AnnexesScpiCaracteristiquesOperationTableProps) {
  return (
    <table
      className={cn(
        "mt-[3mm] w-full table-fixed border-collapse text-left text-[8pt] leading-[1.25] text-neutral-900",
        className
      )}
    >
      <colgroup>
        <col className="w-[14%]" />
        <col className="w-[38%]" />
        <col className="w-[24%]" />
        <col className="w-[24%]" />
      </colgroup>
      <thead>
        <tr>
          <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-semibold [text-align-last:auto]">
            {"\u00a0"}
          </th>
          <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-semibold [text-align-last:auto]">
            {"\u00a0"}
          </th>
          <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-center align-top font-semibold [text-align-last:center]">
            Immobilier
          </th>
          <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-center align-top font-semibold [text-align-last:center]">
            Placements financiers
          </th>
        </tr>
      </thead>
      <tbody>
        {sections.map((section) =>
          section.rows.map((row, rowIndex) => (
            <tr key={`${section.title}-${row.label}`}>
              {rowIndex === 0 && (
                <th
                  rowSpan={section.rows.length}
                  className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-semibold whitespace-pre-wrap [text-align-last:auto]"
                >
                  {section.title}
                </th>
              )}
              <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-normal whitespace-pre-wrap [text-align-last:auto]">
                {row.label}
              </th>
              <ValueCell cell={row.immobilier} />
              <ValueCell cell={row.placementsFinanciers} />
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}