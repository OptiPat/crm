import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { TemplateEmailAttachmentMeta } from "@/lib/emails/template-email-attachments";

export async function importTemplateEmailAttachment(
  templateId: number
): Promise<TemplateEmailAttachmentMeta | null> {
  const selected = await open({
    multiple: false,
    directory: false,
  });
  if (!selected || Array.isArray(selected)) return null;
  const record = await invoke<Omit<TemplateEmailAttachmentMeta, "template_id">>(
    "import_template_email_attachment_cmd",
    {
      templateId,
      sourcePath: selected,
    }
  );
  return { ...record, template_id: templateId };
}

export async function removeTemplateEmailAttachment(
  templateId: number,
  storedName: string
): Promise<void> {
  await invoke<void>("remove_template_email_attachment_cmd", {
    templateId,
    storedName,
  });
}

export async function copyTemplateEmailAttachments(
  fromTemplateId: number,
  toTemplateId: number
): Promise<TemplateEmailAttachmentMeta[]> {
  const copied = await invoke<Omit<TemplateEmailAttachmentMeta, "template_id">[]>(
    "copy_template_email_attachments_cmd",
    {
      fromTemplateId,
      toTemplateId,
    }
  );
  return copied.map((file) => ({ ...file, template_id: toTemplateId }));
}
