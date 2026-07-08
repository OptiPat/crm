import { sanitizeEditorHtml } from "@/components/emails/rich-text-email-editor-utils";
import { cn } from "@/lib/utils";

interface NoteHtmlContentProps {
  html: string;
  className?: string;
}

export function NoteHtmlContent({ html, className }: NoteHtmlContentProps) {
  const safe = sanitizeEditorHtml(html);
  if (!safe.trim()) {
    return <p className="text-sm text-muted-foreground italic">Contenu vide.</p>;
  }
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert [&_ul]:list-disc [&_ol]:list-decimal [&_a]:text-primary [&_a]:underline",
        className
      )}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
