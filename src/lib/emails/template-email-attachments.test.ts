import { describe, expect, it } from "vitest";
import {
  buildSendEmailAttachmentsFromTemplate,
  findOrphanAttachments,
  findRemovedAttachments,
  formatAttachmentSize,
  mergeAttachmentsIntoVariables,
  parseTemplateEmailAttachments,
  setTemplateEmailAttachmentsInMeta,
  TEMPLATE_ATTACHMENTS_KEY,
  type TemplateEmailAttachmentMeta,
} from "@/lib/emails/template-email-attachments";

const sampleAttachment = (overrides?: Partial<TemplateEmailAttachmentMeta>): TemplateEmailAttachmentMeta => ({
  id: "abc",
  filename: "plaquette.pdf",
  mime_type: "application/pdf",
  size_bytes: 1200,
  stored_name: "20260101_plaquette.pdf",
  template_id: 3,
  ...overrides,
});

describe("template-email-attachments", () => {
  it("parse et roundtrip attachments dans variables", () => {
    const list = [sampleAttachment()];
    const vars = setTemplateEmailAttachmentsInMeta(null, list);
    expect(vars).toContain(TEMPLATE_ATTACHMENTS_KEY);
    expect(parseTemplateEmailAttachments(vars)).toEqual(list);
  });

  it("mergeAttachmentsIntoVariables injecte template_id", () => {
    const vars = mergeAttachmentsIntoVariables(null, [sampleAttachment({ template_id: 0 })], 9);
    expect(parseTemplateEmailAttachments(vars)[0]?.template_id).toBe(9);
  });

  it("buildSendEmailAttachmentsFromTemplate ne renvoie que template_id et stored_name", () => {
    const vars = setTemplateEmailAttachmentsInMeta(null, [sampleAttachment()]);
    expect(buildSendEmailAttachmentsFromTemplate(vars)).toEqual([
      { template_id: 3, stored_name: "20260101_plaquette.pdf" },
    ]);
  });

  it("findOrphanAttachments et findRemovedAttachments", () => {
    const baseline = [sampleAttachment()];
    const current = [sampleAttachment({ id: "new", stored_name: "new.pdf" })];
    expect(findOrphanAttachments(current, baseline)).toHaveLength(1);
    expect(findRemovedAttachments(current, baseline)).toHaveLength(1);
  });

  it("formatAttachmentSize affiche Ko/Mo", () => {
    expect(formatAttachmentSize(500)).toBe("500 o");
    expect(formatAttachmentSize(2048)).toBe("2.0 Ko");
    expect(formatAttachmentSize(3 * 1024 * 1024)).toContain("Mo");
  });
});
