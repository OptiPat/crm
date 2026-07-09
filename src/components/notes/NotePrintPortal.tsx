import { createPortal } from "react-dom";
import { NoteHtmlContent } from "@/components/notes/NoteHtmlContent";
import type { NotePrintDocument } from "@/lib/notes/note-print";

type NotePrintPortalProps = {
  document: NotePrintDocument | null;
};

function NotePrintPortalInner({ document: noteDoc }: { document: NotePrintDocument }) {
  return (
    <div id="note-print-portal" aria-hidden>
      <article className="note-print-doc">
        <header className="note-print-header">
          <h1 className="note-print-title">{noteDoc.title}</h1>
          {noteDoc.subtitle ? (
            <p className="note-print-subtitle">{noteDoc.subtitle}</p>
          ) : null}
        </header>
        {noteDoc.sections.map((section, index) => (
          <section key={index} className="note-print-section">
            {section.heading ? (
              <h2 className="note-print-section-title">{section.heading}</h2>
            ) : null}
            {section.meta ? <p className="note-print-section-meta">{section.meta}</p> : null}
            <NoteHtmlContent html={section.contentHtml} className="note-print-body" />
          </section>
        ))}
      </article>
    </div>
  );
}

/** Portail d'impression — hors #root (comme CIF) pour window.print → PDF. */
export function NotePrintPortal({ document: noteDoc }: NotePrintPortalProps) {
  if (!noteDoc) return null;
  return createPortal(<NotePrintPortalInner document={noteDoc} />, document.body);
}
