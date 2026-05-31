import { Calendar, FileText, Mail, Phone, type LucideIcon } from "lucide-react";
import { INTERACTION_TYPES } from "@/lib/api/tauri-interactions";

export const INTERACTION_TYPE_ICONS: Record<string, LucideIcon> = {
  APPEL: Phone,
  EMAIL: Mail,
  RDV: Calendar,
  NOTE: FileText,
  AUTRE: FileText,
};

export function getInteractionTypeLabel(value: string): string {
  return INTERACTION_TYPES.find((t) => t.value === value)?.label || value;
}

export function formatInteractionDateTime(
  ts: number,
  style: "short" | "long" = "short"
): string {
  try {
    return new Date(ts * 1000).toLocaleString("fr-FR", {
      dateStyle: style === "long" ? "full" : "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

export function interactionContactName(prenom: string, nom: string) {
  return `${prenom} ${nom}`.trim() || "Contact";
}

export type InteractionOrigin = "manual" | "campaign_response";

/** Entrée saisie à la main vs trace CRM après campagne email / réponse client. */
export function getInteractionOrigin(item: {
  sujet?: string;
  contenu?: string;
}): InteractionOrigin {
  const sujet = item.sujet ?? "";
  const contenu = item.contenu ?? "";
  if (
    sujet.includes("campagne «") ||
    contenu.startsWith("Retour enregistré après envoi")
  ) {
    return "campaign_response";
  }
  return "manual";
}

export function parseCampaignNameFromSujet(sujet: string): string | null {
  const match = sujet.match(/campagne «([^»]+)»/);
  return match?.[1]?.trim() ?? null;
}

export function parseSentTemplateFromContenu(contenu: string): string | null {
  const match = contenu.match(/Retour enregistré après envoi «([^»]+)»/);
  return match?.[1]?.trim() ?? null;
}

export function formatTemplatePreview(template: string, prenom: string): string {
  return template.replace(/\{\{prenom\}\}/gi, prenom.trim() || "…");
}

export function getInteractionOriginLabel(origin: InteractionOrigin): string {
  return origin === "campaign_response"
    ? "Trace campagne email"
    : "Échange saisi";
}
