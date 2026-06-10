import { describe, expect, it } from "vitest";
import { resolveNewsletterTypography } from "@/lib/newsletter/newsletter-typography";

describe("newsletter-typography", () => {
  it("defaults to classic relaxed typography", () => {
    const typo = resolveNewsletterTypography();
    expect(typo.bodyFontFamily).toContain("Georgia");
    expect(typo.lineHeight).toBe("1.75");
    expect(typo.bodyFontSize).toBe("17px");
  });

  it("resolves modern compact settings", () => {
    const typo = resolveNewsletterTypography({
      bodyFont: "modern",
      bodyFontSize: "sm",
      lineHeight: "normal",
      sectionSpacing: "compact",
    });
    expect(typo.bodyFontFamily).toContain("Arial");
    expect(typo.bodyFontSize).toBe("15px");
    expect(typo.mobileBodyFontSize).toBe("16px");
    expect(typo.lineHeight).toBe("1.6");
    expect(typo.sectionPad).toContain("16px");
  });
});
