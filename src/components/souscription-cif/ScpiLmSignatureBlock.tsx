import type { SouscriptionPreviewSegment } from "@/lib/souscription-cif/render-template";
import { cifTextUnderlineClass } from "@/lib/souscription-cif/document-page-layout";
import { cn } from "@/lib/utils";

type ScpiLmSignatureBlockProps = {
  left: SouscriptionPreviewSegment[][];
  right: SouscriptionPreviewSegment[][];
  className?: string;
};

function RenderSegments({ segments }: { segments: SouscriptionPreviewSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <span key={i}>{seg.value}</span>
        ) : seg.kind === "underline" ? (
          <span key={i} className={cifTextUnderlineClass}>
            {seg.value}
          </span>
        ) : seg.kind === "bold" ? (
          <span key={i} className="font-bold">
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

function SignatureColumn({
  lines,
  className,
}: {
  lines: SouscriptionPreviewSegment[][];
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 text-center leading-snug [text-align-last:center]", className)}>
      {lines.map((line, i) =>
        line.length === 0 ? (
          <p key={i} className="h-[1.15em]" aria-hidden="true">
            &nbsp;
          </p>
        ) : (
          <p key={i}>
            <RenderSegments segments={line} />
          </p>
        )
      )}
    </div>
  );
}

export function ScpiLmSignatureBlock({ left, right, className }: ScpiLmSignatureBlockProps) {
  return (
    <div className={cn("mt-[6mm] flex justify-center", className)}>
      <div className="grid w-full max-w-[160mm] grid-cols-[1fr_auto_1fr] items-stretch">
        <SignatureColumn lines={left} className="px-[3mm]" />
        <div className="cif-signature-divider" aria-hidden />
        <SignatureColumn lines={right} className="px-[3mm]" />
      </div>
    </div>
  );
}
