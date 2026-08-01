import { describe, expect, it } from "vitest";
import { computeNewsletterComposerSteps } from "@/lib/newsletter/newsletter-composer-steps";

describe("computeNewsletterComposerSteps", () => {
  it("marks audience as active when nothing is done", () => {
    const steps = computeNewsletterComposerSteps({
      hasRecipients: false,
      hasContent: false,
      hasPreparedCampaign: false,
      hasSendProgress: false,
    });
    expect(steps.find((s) => s.id === "audience")?.active).toBe(true);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it("advances to content when recipients are set", () => {
    const steps = computeNewsletterComposerSteps({
      hasRecipients: true,
      hasContent: false,
      hasPreparedCampaign: false,
      hasSendProgress: false,
    });
    expect(steps.find((s) => s.id === "audience")?.done).toBe(true);
    expect(steps.find((s) => s.id === "content")?.active).toBe(true);
  });

  it("marks send done when brevo or gmail progressed", () => {
    const steps = computeNewsletterComposerSteps({
      hasRecipients: true,
      hasContent: true,
      hasPreparedCampaign: true,
      hasSendProgress: true,
    });
    expect(steps[steps.length - 1]?.done).toBe(true);
    expect(steps[steps.length - 1]?.active).toBe(true);
  });
});
