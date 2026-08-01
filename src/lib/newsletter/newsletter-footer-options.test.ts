import { describe, expect, it } from "vitest";
import {
  footerProfileFromCgp,
  formatFooterSiteLabel,
  shouldShowFooterSite,
} from "@/lib/newsletter/newsletter-footer-options";

describe("newsletter-footer-options", () => {
  it("formats site label as compact domain", () => {
    expect(formatFooterSiteLabel("https://www.exemple.fr/contact")).toBe("exemple.fr");
    expect(formatFooterSiteLabel("www.exemple.fr")).toBe("exemple.fr");
  });

  it("shows site in footer by default when profile has one", () => {
    expect(
      shouldShowFooterSite(
        { subject: "S", intro: "", sections: [], cta: "" },
        "https://cabinet.fr"
      )
    ).toBe(true);
    expect(
      shouldShowFooterSite(
        { subject: "S", intro: "", sections: [], cta: "", includeFooterSite: false },
        "https://cabinet.fr"
      )
    ).toBe(false);
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
      conseillerName: undefined,
      phone: "06 00 00 00 00",
      siteWeb: "https://exemple.fr",
      postalAddress: "1 rue Test, 75001 Paris",
    });
  });

  it("includes conseiller name from cgp profile", () => {
    expect(
      footerProfileFromCgp({
        wizard_completed: true,
        wizard_step: 4,
        prenom: "Jean",
        nom: "DUPONT",
        telephone: "06 00 00 00 00",
      }).conseillerName
    ).toBe("Jean DUPONT");
  });
});
