import type { SouscriptionPreviewSegment } from "@/lib/souscription-cif/render-template";
import { cn } from "@/lib/utils";

export type RmRecapTableRow = {
  title: string;
  contentSegments: SouscriptionPreviewSegment[];
};

type RmRecapTableProps = {
  rows: RmRecapTableRow[];
  className?: string;
};

function RenderSegments({ segments }: { segments: SouscriptionPreviewSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <span key={i}>{seg.value}</span>
        ) : seg.kind === "underline" ? (
          <span key={i} className="underline">
            {seg.value}
          </span>
        ) : (
          <mark
            key={i}
            className="rounded bg-amber-200/90 px-0.5 text-amber-950 not-italic"
            title={`Variable : ${seg.key}`}
          >
            [{seg.label}]
          </mark>
        )
      )}
    </>
  );
}

export function RmRecapTable({ rows, className }: RmRecapTableProps) {
  return (
    <table
      className={cn(
        "mt-[4mm] w-full table-fixed border-collapse text-left text-[8pt] leading-[1.25] text-neutral-900",
        className
      )}
    >
      <colgroup>
        <col className="w-[28%]" />
        <col className="w-[72%]" />
      </colgroup>
      <tbody>
        {rows.map((row) => (
          <tr key={row.title}>
            <th className="border border-neutral-400 bg-neutral-50 px-1.5 py-1.5 text-left align-top font-semibold whitespace-pre-wrap [text-align-last:auto]">
              {row.title}
            </th>
            <td className="border border-neutral-400 px-1.5 py-1.5 align-top whitespace-pre-wrap [text-align-last:auto]">
              <RenderSegments segments={row.contentSegments} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
