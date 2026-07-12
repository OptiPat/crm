import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import { rdvVisioToApiPayload } from "@/lib/calendar/rdv-visio";
import type { ContactRegistre } from "@/lib/emails/template-email-formality";
import type { Contact } from "@/lib/api/tauri-contacts";
import { contactRegistreFromContact } from "@/lib/emails/template-email-formality";

const PARIS_TZ = "Europe/Paris";

/** Nom puis prénom (ex. DUPONT Jean) — libellé co-participant RDV. */
export function formatPipeRdvParticipantNomPrenom(
  prenom?: string | null,
  nom?: string | null
): string {
  return [nom?.trim(), prenom?.trim()].filter(Boolean).join(" ");
}

export function formatPipeRdvEmailDate(startAtUnix: number): string {
  return new Date(startAtUnix * 1000).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: PARIS_TZ,
  });
}

export function formatPipeRdvEmailTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PARIS_TZ,
  });
}

export function coContactLabelForRecipient(
  pipe: Pick<
    PipeRecord,
    | "contact_id"
    | "contact_prenom"
    | "contact_nom"
    | "secondary_contact_id"
    | "secondary_contact_prenom"
    | "secondary_contact_nom"
  >,
  recipientContactId: number
): string {
  if (
    pipe.secondary_contact_id != null &&
    pipe.secondary_contact_id > 0 &&
    recipientContactId === pipe.contact_id
  ) {
    return formatPipeRdvParticipantNomPrenom(
      pipe.secondary_contact_prenom,
      pipe.secondary_contact_nom
    );
  }
  if (
    pipe.secondary_contact_id != null &&
    recipientContactId === pipe.secondary_contact_id
  ) {
    return formatPipeRdvParticipantNomPrenom(pipe.contact_prenom, pipe.contact_nom);
  }
  return "";
}

/** Couple sur l'affaire → vouvoiement pour les deux (même si tutoiement en fiche). */
export function pipeRdvRegistreForContact(
  contact: Pick<Contact, "registre">,
  pipe: Pick<PipeRecord, "secondary_contact_id">
): ContactRegistre {
  if (pipe.secondary_contact_id != null && pipe.secondary_contact_id > 0) {
    return "VOUS";
  }
  return contactRegistreFromContact(contact);
}

export function resolveRdvEmailVisioAndLieu(options: {
  visioLink?: string | null;
  eventLocation?: string | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
}): { lien_visio: string; lieu_rdv: string } {
  const fromGoogle = options.visioLink?.trim();
  if (fromGoogle) {
    return { lien_visio: fromGoogle, lieu_rdv: options.eventLocation?.trim() ?? "" };
  }
  const payload = rdvVisioToApiPayload(options.visio ?? { mode: "none" }, options.physicalAddress);
  if (payload.visioLink?.trim()) {
    return { lien_visio: payload.visioLink.trim(), lieu_rdv: "" };
  }
  const lieu =
    payload.eventLocation?.trim() ??
    options.eventLocation?.trim() ??
    options.physicalAddress?.trim() ??
    "";
  return { lien_visio: "", lieu_rdv: lieu };
}

export function buildPipeRdvEmailExtraVariables(options: {
  pipe: Pick<
    PipeRecord,
    | "contact_id"
    | "contact_prenom"
    | "contact_nom"
    | "secondary_contact_id"
    | "secondary_contact_prenom"
    | "secondary_contact_nom"
  >;
  recipientContactId: number;
  startAtUnix: number;
  endAtUnix: number;
  visioLink?: string | null;
  eventLocation?: string | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
}): Record<string, string> {
  const { lien_visio, lieu_rdv } = resolveRdvEmailVisioAndLieu(options);
  return {
    date_rdv: formatPipeRdvEmailDate(options.startAtUnix),
    heure_rdv: formatPipeRdvEmailTime(options.startAtUnix),
    heure_fin_rdv: formatPipeRdvEmailTime(options.endAtUnix),
    lien_visio,
    lieu_rdv,
    co_contact: coContactLabelForRecipient(options.pipe, options.recipientContactId),
  };
}
