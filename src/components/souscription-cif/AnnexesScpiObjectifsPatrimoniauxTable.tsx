import {
  ANNEXES_SCPI_OBJECTIFS_PATRIMONIAUX_ROWS,
  formatObjectifPatrimonialCheck,
  type AnnexesScpiObjectifsPatrimoniauxRow,
} from "@/lib/souscription-cif/annexes-scpi-objectifs-patrimoniaux-table";
import { formatCapitalInvestObjectifPatrimonialCheck } from "@/lib/souscription-cif/annexes-capital-invest-objectifs-patrimoniaux-table";
import { cn } from "@/lib/utils";

type AnnexesScpiObjectifsPatrimoniauxTableProps = {
  rows?: ReadonlyArray<AnnexesScpiObjectifsPatrimoniauxRow>;
  variant?: "scpi" | "capital-invest" | "g3f";
  className?: string;
};

function CheckCell({
  checked,
  variant = "scpi",
}: {
  checked: boolean;
  variant?: "scpi" | "capital-invest" | "g3f";
}) {
  const formatCheck =
    variant === "scpi"
      ? formatObjectifPatrimonialCheck
      : formatCapitalInvestObjectifPatrimonialCheck;
  return (
    <td className="border border-neutral-400 px-1.5 py-1.5 text-center align-middle [text-align-last:center]">
      {formatCheck(checked)}
    </td>
  );
}

export function AnnexesScpiObjectifsPatrimoniauxTable({
  rows = ANNEXES_SCPI_OBJECTIFS_PATRIMONIAUX_ROWS,
  variant = "scpi",
  className,
}: AnnexesScpiObjectifsPatrimoniauxTableProps) {
  return (
    <table
      className={cn(
        "mt-[3mm] w-full table-fixed border-collapse text-left text-[8pt] leading-[1.25] text-neutral-900",
        className
      )}
    >
      <colgroup>
        <col className="w-[52%]" />
        <col className="w-[24%]" />
        <col className="w-[24%]" />
      </colgroup>
      <thead>
        <tr>
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
        {rows.map((row) => (
          <tr key={row.label}>
            <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-normal whitespace-pre-wrap [text-align-last:auto]">
              {row.label}
            </th>
            <CheckCell checked={row.immobilier} variant={variant} />
            <CheckCell checked={row.placementsFinanciers} variant={variant} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
