import {
  CAPITAL_INVEST_FISCALITE_TABLE_ROWS,
  formatCapitalInvestFiscaliteCheck,
  type CapitalInvestFiscaliteTableRow,
} from "@/lib/souscription-cif/annexes-capital-invest-fiscalite-table";
import { cn } from "@/lib/utils";

const FCPI_HEADER = "#8b2635";
const FIP_HEADER = "hsl(221 83% 24%)";
const FCPI_CELL_BG = "rgba(139, 38, 53, 0.12)";
const FIP_CELL_BG = "rgba(30, 58, 95, 0.12)";

type CapitalInvestFiscaliteTableProps = {
  rows?: ReadonlyArray<CapitalInvestFiscaliteTableRow>;
  className?: string;
};

function DataRow({ row }: { row: Extract<CapitalInvestFiscaliteTableRow, { kind: "data" }> }) {
  return (
    <tr>
      <th className="border border-neutral-400 px-1.5 py-1.5 text-left align-top font-normal whitespace-pre-wrap [text-align-last:auto]">
        {row.label}
      </th>
      <td
        className={cn(
          "border border-neutral-400 px-1.5 py-1.5 text-center align-top font-semibold [text-align-last:center]",
          row.highlightFcpi && "font-bold"
        )}
        style={row.highlightFcpi ? { backgroundColor: FCPI_CELL_BG } : undefined}
      >
        {row.fcpi}
      </td>
      <td
        className={cn(
          "border border-neutral-400 px-1.5 py-1.5 text-center align-top font-semibold [text-align-last:center]",
          row.highlightFipOm && "font-bold"
        )}
        style={row.highlightFipOm ? { backgroundColor: FIP_CELL_BG } : undefined}
      >
        {row.fipOm}
      </td>
    </tr>
  );
}

function NicheRow({ row }: { row: Extract<CapitalInvestFiscaliteTableRow, { kind: "niche" }> }) {
  return (
    <tr>
      <th className="border border-neutral-400 px-1.5 py-1.5 text-left align-top font-normal whitespace-pre-wrap [text-align-last:auto]">
        {row.label}
      </th>
      <td className="border border-neutral-400 px-1.5 py-1.5 text-center align-top [text-align-last:center]">
        {formatCapitalInvestFiscaliteCheck(row.fcpi)}
      </td>
      <td className="border border-neutral-400 px-1.5 py-1.5 text-center align-top [text-align-last:center]">
        {formatCapitalInvestFiscaliteCheck(row.fipOm)}
      </td>
    </tr>
  );
}

export function CapitalInvestFiscaliteTable({
  rows = CAPITAL_INVEST_FISCALITE_TABLE_ROWS,
  className,
}: CapitalInvestFiscaliteTableProps) {
  return (
    <table
      className={cn(
        "cif-capital-invest-fiscalite-table mt-[3mm] w-full table-fixed border-collapse text-left text-[8pt] leading-[1.25] text-neutral-900",
        className
      )}
    >
      <colgroup>
        <col className="w-[44%]" />
        <col className="w-[28%]" />
        <col className="w-[28%]" />
      </colgroup>
      <thead>
        <tr>
          <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top [text-align-last:auto]">
            {"\u00a0"}
          </th>
          <th
            className="border border-neutral-400 px-1.5 py-1.5 text-center align-top font-semibold text-white [text-align-last:center]"
            style={{ backgroundColor: FCPI_HEADER }}
          >
            FCPI
          </th>
          <th
            className="border border-neutral-400 px-1.5 py-1.5 text-center align-top font-semibold text-white [text-align-last:center]"
            style={{ backgroundColor: FIP_HEADER }}
          >
            FIP OUTRE-MER
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) =>
          row.kind === "data" ? <DataRow key={i} row={row} /> : <NicheRow key={i} row={row} />
        )}
      </tbody>
    </table>
  );
}
