import { useMemo } from "react";
import { buildR1ChecklistEmailPreviewDocument } from "@/lib/pipe/pipe-checklist-email-list";

export function R1ChecklistEmailHtmlPreview({ html }: { html: string }) {
  const srcDoc = useMemo(() => buildR1ChecklistEmailPreviewDocument(html), [html]);
  if (!srcDoc) return null;

  return (
    <iframe
      title="Aperçu HTML liste documents R1"
      srcDoc={srcDoc}
      sandbox=""
      className="w-full border-0 bg-transparent block min-h-[4rem]"
      onLoad={(event) => {
        const frame = event.currentTarget;
        const height = frame.contentDocument?.documentElement?.scrollHeight;
        if (height && height > 0) {
          frame.style.height = `${height}px`;
        }
      }}
    />
  );
}
