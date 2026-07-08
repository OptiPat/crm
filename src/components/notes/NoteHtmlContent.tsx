import { sanitizeNoteHtml } from "@/lib/notes/note-html";
import { handleNoteLinkClick } from "@/lib/notes/note-external-link";
import { cn } from "@/lib/utils";

interface NoteHtmlContentProps {
  html: string;
  className?: string;
}

export function NoteHtmlContent({ html, className }: NoteHtmlContentProps) {
  const safe = sanitizeNoteHtml(html);
  if (!safe.trim()) {
    return <p className="text-sm text-muted-foreground italic">Contenu vide.</p>;
  }
  return (
    <div
      className={cn(
        "text-sm max-w-none leading-normal",
        "[&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline",
        "[&_a]:text-primary [&_a]:underline",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1",
        "[&_li]:leading-normal",
        "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md [&_img]:my-2",
        className
      )}
      onClick={handleNoteLinkClick}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
