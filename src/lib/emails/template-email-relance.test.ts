import { describe, expect, it } from "vitest";
import {
  isTemplateEmailRelanceEnabledForQueue,
  parseTemplateEmailRelance,
  setTemplateEmailRelanceInMeta,
} from "@/lib/emails/template-email-relance";

describe("template-email-relance", () => {
  it("active et désactive la relance dans variables", () => {
    const vars = setTemplateEmailRelanceInMeta(null, { enabled: true });
    expect(parseTemplateEmailRelance(vars).enabled).toBe(true);
    const off = setTemplateEmailRelanceInMeta(vars, { enabled: false });
    expect(parseTemplateEmailRelance(off).enabled).toBe(false);
    expect(off).toContain("email_relance");
  });

  it("file d'envoi : clé absente = comportement historique", () => {
    expect(isTemplateEmailRelanceEnabledForQueue(null)).toBe(true);
    expect(
      isTemplateEmailRelanceEnabledForQueue(
        JSON.stringify({ email_relance: { enabled: false } })
      )
    ).toBe(false);
  });
});
