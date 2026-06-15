import {
  ANNEXES_SCPI_COSTS_ROWS,
  type AnnexesScpiCostsRow,
} from "@/lib/souscription-cif/annexes-scpi-costs-table";
import { cn } from "@/lib/utils";

type AnnexesScpiCostsTableProps = {
  rows?: ReadonlyArray<AnnexesScpiCostsRow>;
  className?: string;
};

function AmountCell({ value }: { value: string }) {
  return (
    <td className="border border-neutral-400 px-1.5 py-1.5 align-top text-right whitespace-pre-wrap [text-align-last:auto]">
      {value || "\u00a0"}
    </td>
  );
}

function LabelCell({ label, isTotal }: { label: string; isTotal?: boolean }) {
  return (
    <td
      className={cn(
        "border border-neutral-400 px-1.5 py-1.5 align-top whitespace-pre-wrap text-left [text-align-last:auto]",
        isTotal && "font-semibold"
      )}
    >
      {label}
    </td>
  );
}

export function AnnexesScpiCostsTable({
  rows = ANNEXES_SCPI_COSTS_ROWS,
  className,
}: AnnexesScpiCostsTableProps) {
  return (
    <table
      className={cn(
        "mt-[2mm] w-full table-fixed border-collapse text-left text-[8pt] leading-[1.25] text-neutral-900",
        className
      )}
    >
      <colgroup>
        <col className="w-[58%]" />
        <col className="w-[21%]" />
        <col className="w-[21%]" />
      </colgroup>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <LabelCell label={row.label} isTotal={row.isTotal} />
            <AmountCell value={row.amount} />
            <AmountCell value={row.percent} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
