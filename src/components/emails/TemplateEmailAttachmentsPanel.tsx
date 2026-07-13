import { Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  formatAttachmentSize,
  MAX_TEMPLATE_ATTACHMENTS,
  type TemplateEmailAttachmentMeta,
} from "@/lib/emails/template-email-attachments";
import { importTemplateEmailAttachment } from "@/lib/api/tauri-template-email-attachments";
import { toast } from "sonner";

interface TemplateEmailAttachmentsPanelProps {
  templateId: number | null;
  attachments: TemplateEmailAttachmentMeta[];
  onChange: (attachments: TemplateEmailAttachmentMeta[]) => void;
  disabled?: boolean;
}

export function TemplateEmailAttachmentsPanel({
  templateId,
  attachments,
  onChange,
  disabled = false,
}: TemplateEmailAttachmentsPanelProps) {
  const handleAdd = async () => {
    if (!templateId) {
      toast.message("Enregistrez le modèle avant d'ajouter une pièce jointe.");
      return;
    }
    if (attachments.length >= MAX_TEMPLATE_ATTACHMENTS) {
      toast.error(`Maximum ${MAX_TEMPLATE_ATTACHMENTS} pièces jointes.`);
      return;
    }
    try {
      const added = await importTemplateEmailAttachment(templateId);
      if (!added) return;
      onChange([...attachments, added]);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleRemove = (att: TemplateEmailAttachmentMeta) => {
    onChange(attachments.filter((a) => a.id !== att.id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Pièces jointes</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled || !templateId || attachments.length >= MAX_TEMPLATE_ATTACHMENTS}
          onClick={() => void handleAdd()}
        >
          <Paperclip className="h-3.5 w-3.5" />
          Ajouter
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Mêmes fichiers pour tous les destinataires (max {MAX_TEMPLATE_ATTACHMENTS}, 25 Mo chacun).
        Stockés localement sur cette installation. Les retraits sont appliqués à l&apos;enregistrement.
      </p>
      {!templateId && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Enregistrez le modèle une première fois pour pouvoir joindre des fichiers.
        </p>
      )}
      {attachments.length > 0 ? (
        <ul className="space-y-1.5 rounded-lg border divide-y">
          {attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{att.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatAttachmentSize(att.size_bytes)}
                  {att.mime_type ? ` · ${att.mime_type}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                disabled={disabled}
                onClick={() => handleRemove(att)}
                aria-label={`Retirer ${att.filename}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground italic">Aucune pièce jointe.</p>
      )}
    </div>
  );
}
