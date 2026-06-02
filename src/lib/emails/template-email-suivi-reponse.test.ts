import { describe, expect, it } from "vitest";
import {
  isTemplateAttendreReponseForQueue,
  parseTemplateEmailSuiviReponse,
  setTemplateEmailSuiviReponseInMeta,
} from "@/lib/emails/template-email-suivi-reponse";

describe("template-email-suivi-reponse", () => {
  it("defaults to attendre when key absent", () => {
    expect(parseTemplateEmailSuiviReponse(null).attendre_reponse).toBe(true);
    expect(isTemplateAttendreReponseForQueue(null)).toBe(true);
  });

  it("persists attendre_reponse false", () => {
    const vars = setTemplateEmailSuiviReponseInMeta(null, { attendre_reponse: false });
    expect(parseTemplateEmailSuiviReponse(vars).attendre_reponse).toBe(false);
    expect(isTemplateAttendreReponseForQueue(vars)).toBe(false);
  });
});
