import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import { openExternalUrl } from "@/lib/api/tauri-system";
import {
  buildSmsUrl,
  buildWhatsAppUrl,
  hasMessagingPhone,
} from "@/lib/contacts/birthday-outreach";

export type CampaignMessagingChannel = "sms" | "whatsapp";

/** Salutation par défaut pour relance SMS/WhatsApp (tu/vous + prénom). */
export function buildCampaignMessagingRelanceGreeting(
  prenom: string,
  registre?: string | null
): string {
  const first = prenom.trim().split(/\s+/)[0] || "ami";
  const tu = registre?.trim().toUpperCase() === "TU";
  return tu ? `Salut ${first}, ` : `Bonjour ${first}, `;
}

export function hasCampaignMessagingRelanceSent(
  item: Pick<EtiquetteEmailQueueItem, "relance_canal">
): boolean {
  return Boolean(item.relance_canal?.trim());
}

export function campaignMessagingRelanceChannelLabel(
  canal: string | null | undefined
): string | null {
  if (canal === "sms") return "SMS";
  if (canal === "whatsapp") return "WhatsApp";
  return null;
}

export async function openCampaignMessagingRelance(
  item: EtiquetteEmailQueueItem,
  channel: CampaignMessagingChannel
): Promise<string> {
  if (!hasMessagingPhone(item.contact_telephone)) {
    throw new Error("Aucun numéro compatible SMS/WhatsApp sur cette fiche.");
  }

  const message = buildCampaignMessagingRelanceGreeting(
    item.contact_prenom,
    item.contact_registre
  );
  const url =
    channel === "sms"
      ? buildSmsUrl(item.contact_telephone!, message)
      : buildWhatsAppUrl(item.contact_telephone!, message);

  if (!url) {
    throw new Error("Numéro incompatible avec SMS/WhatsApp.");
  }

  await openExternalUrl(url);
  return message;
}
