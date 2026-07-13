import { parseTemplateEmailMeta } from "@/lib/emails/template-email-html";

export const TEMPLATE_ATTACHMENTS_KEY = "attachments";
export const MAX_TEMPLATE_ATTACHMENTS = 10;
export const MAX_TEMPLATE_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_MICROSOFT_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export type TemplateEmailAttachmentMeta = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  stored_name: string;
  template_id: number;
};

export function parseTemplateEmailAttachments(
  variables: string | null | undefined
): TemplateEmailAttachmentMeta[] {
  const meta = parseTemplateEmailMeta(variables);
  const raw = meta[TEMPLATE_ATTACHMENTS_KEY];
  if (!Array.isArray(raw)) return [];
  const out: TemplateEmailAttachmentMeta[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const filename = typeof row.filename === "string" ? row.filename : "";
    const mime_type = typeof row.mime_type === "string" ? row.mime_type : "";
    const stored_name = typeof row.stored_name === "string" ? row.stored_name : "";
    const size_bytes = typeof row.size_bytes === "number" ? row.size_bytes : 0;
    const template_id = typeof row.template_id === "number" ? row.template_id : 0;
    if (!id || !filename || !stored_name || template_id <= 0) continue;
    out.push({ id, filename, mime_type, size_bytes, stored_name, template_id });
  }
  return out;
}

export function setTemplateEmailAttachmentsInMeta(
  variables: string | null | undefined,
  attachments: TemplateEmailAttachmentMeta[]
): string | null {
  const meta = parseTemplateEmailMeta(variables);
  if (attachments.length === 0) {
    delete meta[TEMPLATE_ATTACHMENTS_KEY];
  } else {
    meta[TEMPLATE_ATTACHMENTS_KEY] = attachments;
  }
  return Object.keys(meta).length === 0 ? null : JSON.stringify(meta);
}

export function mergeAttachmentsIntoVariables(
  variables: string | null | undefined,
  attachments: TemplateEmailAttachmentMeta[],
  templateId: number
): string | null {
  return setTemplateEmailAttachmentsInMeta(
    variables,
    attachments.map((att) => ({ ...att, template_id: templateId }))
  );
}

export function findOrphanAttachments(
  current: TemplateEmailAttachmentMeta[],
  baseline: TemplateEmailAttachmentMeta[]
): TemplateEmailAttachmentMeta[] {
  const baselineNames = new Set(baseline.map((b) => b.stored_name));
  return current.filter((a) => !baselineNames.has(a.stored_name));
}

export function findRemovedAttachments(
  current: TemplateEmailAttachmentMeta[],
  baseline: TemplateEmailAttachmentMeta[]
): TemplateEmailAttachmentMeta[] {
  const currentNames = new Set(current.map((a) => a.stored_name));
  return baseline.filter((b) => !currentNames.has(b.stored_name));
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function buildSendEmailAttachmentsFromTemplate(
  variables: string | null | undefined
): { template_id: number; stored_name: string }[] {
  return parseTemplateEmailAttachments(variables).map((att) => ({
    template_id: att.template_id,
    stored_name: att.stored_name,
  }));
}
