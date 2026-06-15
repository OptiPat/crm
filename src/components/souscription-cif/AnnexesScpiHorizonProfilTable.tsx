import {
  buildAnnexesScpiHorizonProfilRowViews,
  formatHorizonProfilCheck,
  type AnnexesScpiHorizonProfilHorizonCell,
  type AnnexesScpiHorizonProfilRowView,
} from "@/lib/souscription-cif/annexes-scpi-horizon-profil-table";
import { cn } from "@/lib/utils";

type AnnexesScpiHorizonProfilTableProps = {
  rows?: ReadonlyArray<AnnexesScpiHorizonProfilRowView>;
  className?: string;
};

function HorizonCell({ cell }: { cell: AnnexesScpiHorizonProfilHorizonCell }) {
  if (cell.kind === "empty") {
    return (
      <td className="border border-neutral-400 px-1.5 py-1.5 align-top text-left [text-align-last:auto]">
        {"\u00a0"}
      </td>
    );
  }

  return (
    <td className="border border-neutral-400 px-1.5 py-1.5 align-top whitespace-pre-wrap text-left [text-align-last:auto]">
      {formatHorizonProfilCheck(cell.checked)} {cell.label}
    </td>
  );
}

function ProfileCell({ checked, label }: { checked: boolean; label: string }) {
  return (
    <td className="border border-neutral-400 px-1.5 py-1.5 align-top whitespace-pre-wrap text-left [text-align-last:auto]">
      {formatHorizonProfilCheck(checked)} {label}
    </td>
  );
}

export function AnnexesScpiHorizonProfilTable({
  rows = buildAnnexesScpiHorizonProfilRowViews(),
  className,
}: AnnexesScpiHorizonProfilTableProps) {
  return (
    <table
      className={cn(
        "mt-[3mm] w-full table-fixed border-collapse text-left text-[8pt] leading-[1.25] text-neutral-900",
        className
      )}
    >
      <colgroup>
        <col className="w-[22%]" />
        <col className="w-[34%]" />
        <col className="w-[44%]" />
      </colgroup>
      <thead>
        <tr>
          <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-semibold [text-align-last:auto]">
            {"\u00a0"}
          </th>
          <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-center align-top font-semibold [text-align-last:center]">
            HORIZON
          </th>
          <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-center align-top font-semibold [text-align-last:center]">
            PROFIL D&apos;INVESTISSEMENT
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={row.profileSri}>
            {rowIndex === 0 && (
              <th
                rowSpan={rows.length}
                className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-semibold whitespace-pre-wrap [text-align-last:auto]"
              >
                Opérations retenues
              </th>
            )}
            <HorizonCell cell={row.horizon} />
            <ProfileCell checked={row.profileChecked} label={row.profileLabel} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
