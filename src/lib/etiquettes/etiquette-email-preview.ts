import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";
import { buildVariablesFromContact } from "@/lib/emails/template-email-meta";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";

export function buildTemplateVariables(
  item: EtiquetteEmailQueueItem,
  cgp: CgpConfig | null
): Record<string, string> {
  return buildVariablesFromContact(
    {
      prenom: item.contact_prenom,
      nom: item.contact_nom,
      email: item.contact_email,
      telephone: item.contact_telephone,
    },
    cgp
  );
}

export function renderEtiquetteEmailPreview(
  item: EtiquetteEmailQueueItem,
  cgp: CgpConfig | null
): { subject: string; body: string } {
  const vars = buildTemplateVariables(item, cgp);
  return {
    subject: replaceTemplateVariables(item.template_sujet, vars),
    body: replaceTemplateVariables(item.template_corps, vars),
  };
}

/** datetime-local (YYYY-MM-DDTHH:mm) → unix secondes */
export function localDatetimeToUnix(isoLocal: string): number | null {
  if (!isoLocal.trim()) return null;
  const ms = new Date(isoLocal).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

export function unixToLocalDatetime(ts: number | null | undefined): string {
  if (ts == null || ts <= 0) return "";
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const INCOMPLETE_LABELS: Record<string, string> = {
  NO_EMAIL: "Email manquant sur la fiche contact",
  NO_TEMPLATE: "Template d'email manquant sur l'étiquette",
  NO_DATE: "Date d'envoi non définie sur l'étiquette",
  SCHEDULED: "Envoi prévu plus tard (date pas encore atteinte)",
  OTHER: "Informations à compléter",
};

export function getIncompleteQueueLabel(issue: string | null | undefined): string {
  if (!issue) return INCOMPLETE_LABELS.OTHER;
  return INCOMPLETE_LABELS[issue] ?? INCOMPLETE_LABELS.OTHER;
}

export function formatEtiquetteSendDatetime(ts: number | null | undefined): string {
  if (ts == null) return "—";
  return new Date(ts * 1000).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
