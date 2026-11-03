/** Boîte SMTP / IMAP (OVH, Ionos…) — même valeur que `IMAP_PROVIDER` côté Rust. */
export const IMAP_MAIL_PROVIDER = "imap";

/** Libellé court de la boîte connectée (« Google », « Microsoft », « Messagerie »). */
export function mailProviderLabel(provider: string | null | undefined): string | null {
  switch (provider) {
    case "google":
      return "Google";
    case "microsoft":
      return "Microsoft";
    case IMAP_MAIL_PROVIDER:
      return "Messagerie";
    default:
      return null;
  }
}

/** Détection des réponses campagnes (Suivi → Envois) disponible pour cette boîte. */
export function supportsCampaignReplySync(provider: string | null | undefined): boolean {
  return canReadMailbox(provider);
}

/**
 * Boîte lisible par le CRM : réponses campagnes, scans Stellium / Exceltis et Box Placement,
 * historique des emails de la fiche contact (Gmail, Outlook 365, IMAP).
 */
export function canReadMailbox(provider: string | null | undefined): boolean {
  return provider === "google" || provider === "microsoft" || provider === IMAP_MAIL_PROVIDER;
}
