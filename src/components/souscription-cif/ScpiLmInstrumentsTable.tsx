import {
  SCPI_LM_INSTRUMENTS_TABLE_HEADERS,
  SCPI_LM_INSTRUMENTS_TABLE_ROWS,
} from "@/lib/souscription-cif/scpi-lettre-mission-instruments-table";
import { cn } from "@/lib/utils";

type ScpiLmInstrumentsTableProps = {
  className?: string;
};

function TableCell({ children }: { children: string }) {
  return (
    <td className="border border-neutral-400 px-1 py-1 text-left align-top whitespace-pre-wrap [text-align-last:auto]">
      {children}
    </td>
  );
}

export function ScpiLmInstrumentsTable({ className }: ScpiLmInstrumentsTableProps) {
  return (
    <table
      className={cn(
        "mt-[3mm] w-full table-fixed border-collapse text-left text-[6.5pt] leading-[1.2] text-neutral-900",
        className
      )}
    >
      <colgroup>
        <col className="w-[14%]" />
        <col className="w-[11%]" />
        <col className="w-[18%]" />
        <col className="w-[22%]" />
        <col className="w-[17%]" />
        <col className="w-[18%]" />
      </colgroup>
      <thead>
        <tr>
          {SCPI_LM_INSTRUMENTS_TABLE_HEADERS.map((header, i) => (
            <th
              key={i}
              className="border border-neutral-400 bg-neutral-50 px-1 py-1 text-left font-semibold align-top whitespace-pre-wrap [text-align-last:auto]"
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SCPI_LM_INSTRUMENTS_TABLE_ROWS.map((row) => (
          <tr key={row.product}>
            <TableCell>{row.product}</TableCell>
            <TableCell>{row.riskScale}</TableCell>
            <TableCell>{row.warnings}</TableCell>
            <TableCell>{row.fees}</TableCell>
            <TableCell>{row.paymentMode}</TableCell>
            <TableCell>{row.sustainability}</TableCell>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
