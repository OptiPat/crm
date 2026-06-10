import type { GeneratedNewsletterContent } from "@/lib/api/tauri-newsletter";
import type { CgpConfig } from "@/lib/api/tauri-settings";

export function formatCgpPostalAddress(cgp: CgpConfig | null | undefined): string | undefined {
  if (!cgp) return undefined;
  const street = cgp.adresse?.trim();
  const cp = cgp.code_postal?.trim();
  const city = cgp.ville?.trim();
  const cityLine = [cp, city].filter(Boolean).join(" ");
  const parts = [street, cityLine].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export interface NewsletterFooterProfile {
  phone?: string;
  siteWeb?: string;
  postalAddress?: string;
}

export function footerProfileFromCgp(cgp: CgpConfig | null | undefined): NewsletterFooterProfile {
  return {
    phone: cgp?.telephone?.trim() || undefined,
    siteWeb: cgp?.site_web?.trim() || undefined,
    postalAddress: formatCgpPostalAddress(cgp),
  };
}

export function footerProfileHasOptions(profile: NewsletterFooterProfile): boolean {
  return Boolean(profile.phone || profile.siteWeb || profile.postalAddress);
}

export function shouldShowFooterPhone(
  content: GeneratedNewsletterContent,
  phone?: string | null
): boolean {
  return content.includeFooterPhone === true && Boolean(phone?.trim());
}

export function shouldShowFooterSite(
  content: GeneratedNewsletterContent,
  siteWeb?: string | null
): boolean {
  return content.includeFooterSite === true && Boolean(siteWeb?.trim());
}

export function shouldShowFooterAddress(
  content: GeneratedNewsletterContent,
  postalAddress?: string | null
): boolean {
  return content.includeFooterAddress === true && Boolean(postalAddress?.trim());
}
