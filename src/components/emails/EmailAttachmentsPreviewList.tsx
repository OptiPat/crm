import { Paperclip } from "lucide-react";
import {
  formatAttachmentSize,
  parseTemplateEmailAttachments,
} from "@/lib/emails/template-email-attachments";

type EmailAttachmentsPreviewListProps = {
  variables: string | null | undefined;
  compact?: boolean;
};

export function EmailAttachmentsPreviewList({
  variables,
  compact = false,
}: EmailAttachmentsPreviewListProps) {
  const attachments = parseTemplateEmailAttachments(variables);
  if (attachments.length === 0) return null;

  const label =
    attachments.length > 1
      ? `${attachments.length} pièces jointes`
      : "1 pièce jointe";

  if (compact) {
    const first = attachments[0]!;
    const extra = attachments.length > 1 ? ` +${attachments.length - 1}` : "";
    return (
      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
        <Paperclip className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {label} : {first.filename} ({formatAttachmentSize(first.size_bytes)}){extra}
        </span>
      </p>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1.5">
      <p className="text-xs font-medium flex items-center gap-1">
        <Paperclip className="h-3.5 w-3.5" />
        {label} (envoyées avec le message)
      </p>
      <ul className="text-xs text-muted-foreground space-y-0.5">
        {attachments.map((att) => (
          <li key={att.id} className="truncate">
            {att.filename} ({formatAttachmentSize(att.size_bytes)})
          </li>
        ))}
      </ul>
    </div>
  );
}
