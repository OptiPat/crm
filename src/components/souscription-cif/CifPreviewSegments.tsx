import { Fragment } from "react";
import type { SouscriptionPreviewSegment } from "@/lib/souscription-cif/render-template";
import { cifTextUnderlineClass } from "@/lib/souscription-cif/document-page-layout";
import { cn } from "@/lib/utils";

type CifPreviewSegmentsProps = {
  segments: SouscriptionPreviewSegment[];
  onMissingVariableClick?: (key: string) => void;
};

function renderTextWithLineBreaks(value: string, keyPrefix: string) {
  const lines = value.split("\n");
  return lines.map((line, lineIndex) => (
    <Fragment key={`${keyPrefix}-${lineIndex}`}>
      {lineIndex > 0 && <br />}
      {line}
    </Fragment>
  ));
}

export function CifPreviewSegments({ segments, onMissingVariableClick }: CifPreviewSegmentsProps) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <span key={i} className="break-words [overflow-wrap:anywhere]">
            {renderTextWithLineBreaks(seg.value, String(i))}
          </span>
        ) : seg.kind === "underline" ? (
          <span key={i} className={cn(cifTextUnderlineClass, "break-words [overflow-wrap:anywhere]")}>
            {renderTextWithLineBreaks(seg.value, String(i))}
          </span>
        ) : seg.kind === "bold" ? (
          <span key={i} className="break-words font-bold [overflow-wrap:anywhere]">
            {renderTextWithLineBreaks(seg.value, String(i))}
          </span>
        ) : (
          <mark
            key={i}
            role={onMissingVariableClick ? "button" : undefined}
            tabIndex={onMissingVariableClick ? 0 : undefined}
            className={cn(
              "rounded bg-amber-200/90 px-0.5 text-amber-950 not-italic",
              onMissingVariableClick &&
                "cursor-pointer underline decoration-amber-600/50 decoration-dotted hover:bg-amber-300/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            )}
            title={
              onMissingVariableClick
                ? `Cliquer pour compléter : ${seg.label}`
                : `Variable : ${seg.key}`
            }
            onClick={
              onMissingVariableClick
                ? (e) => {
                    e.preventDefault();
                    onMissingVariableClick(seg.key);
                  }
                : undefined
            }
            onKeyDown={
              onMissingVariableClick
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onMissingVariableClick(seg.key);
                    }
                  }
                : undefined
            }
          >
            [{seg.label}]
          </mark>
        )
      )}
    </>
  );
}
