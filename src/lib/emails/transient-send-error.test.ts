import { describe, expect, it } from "vitest";
import {
  humanizeTransientEmailSendError,
  isTransientEmailSendError,
} from "@/lib/emails/transient-send-error";

const GMAIL_QUOTA_403 = `Gmail API: {
  "error": {
    "code": 403,
    "message": "Quota exceeded for quota metric 'Total Query Cost'",
    "errors": [{ "reason": "rateLimitExceeded" }],
    "status": "PERMISSION_DENIED"
  }
}`;

describe("isTransientEmailSendError", () => {
  it("détecte le 403 quota Gmail réel", () => {
    expect(isTransientEmailSendError(GMAIL_QUOTA_403)).toBe(true);
  });

  it("ignore une erreur définitive (email manquant)", () => {
    expect(isTransientEmailSendError("Jean DUPONT : pas d'email valide")).toBe(false);
  });

  it("détecte un 429", () => {
    expect(isTransientEmailSendError("Microsoft Graph: 429 Too Many Requests")).toBe(true);
  });
});

describe("humanizeTransientEmailSendError", () => {
  it("humanise le quota Gmail", () => {
    expect(humanizeTransientEmailSendError(GMAIL_QUOTA_403)).toContain("1 min");
  });

  it("laisse le message métier tel quel", () => {
    expect(humanizeTransientEmailSendError("pas d'email valide")).toBe("pas d'email valide");
  });
});
