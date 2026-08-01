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
  conseillerName?: string;
  phone?: string;
  siteWeb?: string;
  postalAddress?: string;
}

export function footerProfileFromCgp(cgp: CgpConfig | null | undefined): NewsletterFooterProfile {
  const conseillerName = [cgp?.prenom?.trim(), cgp?.nom?.trim()].filter(Boolean).join(" ");
  return {
    conseillerName: conseillerName || undefined,
    phone: cgp?.telephone?.trim() || undefined,
    siteWeb: cgp?.site_web?.trim() || undefined,
    postalAddress: formatCgpPostalAddress(cgp),
  };
}

export function footerProfileHasOptions(profile: NewsletterFooterProfile): boolean {
  return Boolean(
    profile.conseillerName || profile.phone || profile.siteWeb || profile.postalAddress
  );
}

/** Libellé court du site pour le pied de page (domaine sans www). */
export function formatFooterSiteLabel(siteWeb: string): string {
  const trimmed = siteWeb.trim();
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProto).hostname.replace(/^www\./i, "");
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "");
  }
}

export function shouldShowFooterConseiller(
  content: GeneratedNewsletterContent,
  conseillerName?: string | null
): boolean {
  return content.includeFooterConseiller !== false && Boolean(conseillerName?.trim());
}

export function shouldShowFooterPhone(
  content: GeneratedNewsletterContent,
  phone?: string | null
): boolean {
  return content.includeFooterPhone !== false && Boolean(phone?.trim());
}

export function shouldShowFooterSite(
  content: GeneratedNewsletterContent,
  siteWeb?: string | null
): boolean {
  return content.includeFooterSite !== false && Boolean(siteWeb?.trim());
}

export function shouldShowFooterAddress(
  content: GeneratedNewsletterContent,
  postalAddress?: string | null
): boolean {
  return content.includeFooterAddress !== false && Boolean(postalAddress?.trim());
}
