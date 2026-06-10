import { describe, expect, it } from "vitest";
import {
  footerProfileFromCgp,
  shouldShowFooterSite,
} from "@/lib/newsletter/newsletter-footer-options";

describe("newsletter-footer-options", () => {
  it("does not show site in footer unless opted in", () => {
    expect(
      shouldShowFooterSite(
        { subject: "S", intro: "", sections: [], cta: "" },
        "https://cabinet.fr"
      )
    ).toBe(false);
    expect(
      shouldShowFooterSite(
        { subject: "S", intro: "", sections: [], cta: "", includeFooterSite: true },
        "https://cabinet.fr"
      )
    ).toBe(true);
  });

  it("reads profile fields from cgp config", () => {
    expect(
      footerProfileFromCgp({
        wizard_completed: true,
        wizard_step: 4,
        telephone: "06 00 00 00 00",
        site_web: "https://exemple.fr",
        adresse: "1 rue Test",
        code_postal: "75001",
        ville: "Paris",
      })
    ).toEqual({
      phone: "06 00 00 00 00",
      siteWeb: "https://exemple.fr",
      postalAddress: "1 rue Test, 75001 Paris",
    });
  });
});
