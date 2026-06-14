import {
  ANNEXES_SCPI_PROS_CONS_ROWS,
  type AnnexesScpiProsConsRow,
} from "@/lib/souscription-cif/annexes-scpi-pros-cons-table";
import { cn } from "@/lib/utils";

type AnnexesScpiProsConsTableProps = {
  rows?: ReadonlyArray<AnnexesScpiProsConsRow>;
  className?: string;
};

function TableCell({ children }: { children: string }) {
  return (
    <td className="border border-neutral-400 px-1.5 py-1.5 align-top whitespace-pre-wrap text-left [text-align-last:auto]">
      {children || "\u00a0"}
    </td>
  );
}

export function AnnexesScpiProsConsTable({
  rows = ANNEXES_SCPI_PROS_CONS_ROWS,
  className,
}: AnnexesScpiProsConsTableProps) {
  return (
    <table
      className={cn(
        "mt-[3mm] w-full table-fixed border-collapse text-left text-[8pt] leading-[1.25] text-neutral-900",
        className
      )}
    >
      <colgroup>
        <col className="w-1/2" />
        <col className="w-1/2" />
      </colgroup>
      <thead>
        <tr>
          <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-semibold [text-align-last:auto]">
            Avantages
          </th>
          <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-semibold [text-align-last:auto]">
            Inconvénients
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <TableCell>{row.advantages}</TableCell>
            <TableCell>{row.disadvantages}</TableCell>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
