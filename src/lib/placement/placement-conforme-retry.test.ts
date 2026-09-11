import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPlacementConformeTransientSendError,
  placementConformeSendErrorUserMessage,
  resetPlacementConformeRetryStateForTests,
  clearPlacementConformeRetryTimersForTests,
  schedulePlacementConformeRetryAfterError,
  PLACEMENT_CONFORME_MAX_AUTO_RETRIES,
} from "@/lib/placement/placement-conforme-retry";

const GMAIL_QUOTA_403 = `Gmail API: {
  "error": {
    "code": 403,
    "message": "Quota exceeded for quota metric 'Total Query Cost'",
    "errors": [{ "reason": "rateLimitExceeded" }],
    "status": "PERMISSION_DENIED"
  }
}`;

describe("isPlacementConformeTransientSendError", () => {
  it("détecte le 403 quota Gmail réel", () => {
    expect(isPlacementConformeTransientSendError(GMAIL_QUOTA_403)).toBe(true);
  });

  it("ignore une erreur définitive (email manquant)", () => {
    expect(
      isPlacementConformeTransientSendError("Jean DUPONT : pas d'email valide")
    ).toBe(false);
  });

  it("détecte un 429", () => {
    expect(isPlacementConformeTransientSendError("Microsoft Graph: 429 Too Many Requests")).toBe(
      true
    );
  });
});

describe("placementConformeSendErrorUserMessage", () => {
  it("humanise le quota Gmail", () => {
    expect(placementConformeSendErrorUserMessage(GMAIL_QUOTA_403)).toContain("1 min");
  });

  it("laisse le message métier tel quel", () => {
    expect(placementConformeSendErrorUserMessage("pas d'email valide")).toBe(
      "pas d'email valide"
    );
  });
});

describe("schedulePlacementConformeRetryAfterError", () => {
  afterEach(() => {
    resetPlacementConformeRetryStateForTests();
    vi.useRealTimers();
  });

  it("planifie une seule fois pour la même opération", () => {
    vi.useFakeTimers();
    expect(schedulePlacementConformeRetryAfterError(180, GMAIL_QUOTA_403)).toBe(true);
    expect(schedulePlacementConformeRetryAfterError(180, GMAIL_QUOTA_403)).toBe(false);
  });

  it("ne planifie pas une erreur définitive", () => {
    expect(schedulePlacementConformeRetryAfterError(180, "pas d'email valide")).toBe(false);
  });

  it("coupe après le plafond de relances", () => {
    for (let i = 0; i < PLACEMENT_CONFORME_MAX_AUTO_RETRIES; i += 1) {
      expect(schedulePlacementConformeRetryAfterError(181, GMAIL_QUOTA_403)).toBe(true);
      clearPlacementConformeRetryTimersForTests();
    }
    expect(schedulePlacementConformeRetryAfterError(181, GMAIL_QUOTA_403)).toBe(false);
  });
});
