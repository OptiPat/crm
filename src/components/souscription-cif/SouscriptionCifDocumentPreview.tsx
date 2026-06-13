import { cn } from "@/lib/utils";
import type { SouscriptionPreviewSegment } from "@/lib/souscription-cif/render-template";

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

type SouscriptionCifDocumentPreviewProps = {
  title: string;
  bodySegments: SouscriptionPreviewSegment[];
  footerSegments: SouscriptionPreviewSegment[];
  className?: string;
};

export function SouscriptionCifDocumentPreview({
  title,
  bodySegments,
  footerSegments,
  className,
}: SouscriptionCifDocumentPreviewProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white text-neutral-900 shadow-sm",
        className
      )}
    >
      <div className="border-b bg-muted/30 px-4 py-2">
        <p className="text-xs font-medium text-muted-foreground">Aperçu — {title}</p>
      </div>
      <div className="min-h-[480px] p-8 sm:p-10 font-serif text-[15px] leading-relaxed whitespace-pre-wrap">
        <RenderSegments segments={bodySegments} />
      </div>
      <div className="border-t px-6 py-4 text-[9px] leading-snug text-neutral-600 font-sans whitespace-pre-wrap">
        <RenderSegments segments={footerSegments} />
      </div>
    </div>
  );
}
