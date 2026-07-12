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
  const parts = new Intl.DateTimeFormat("fr-FR", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: PARIS_TZ,
  }).formatToParts(new Date(unix * 1000));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}h${minute}`;
}

export type PipeRdvCoContactFields = {
  /** NOM Prénom (ex. DUPONT Jean) — cohérent agenda. */
  co_contact: string;
  co_contact_prenom: string;
  co_contact_nom: string;
  /** Couple : « et Marie » ; solo : vide — pour « Bonjour {{prenom}}{{co_contact_et_prenom}}, » */
  co_contact_et_prenom: string;
};

const EMPTY_CO_CONTACT: PipeRdvCoContactFields = {
  co_contact: "",
  co_contact_prenom: "",
  co_contact_nom: "",
  co_contact_et_prenom: "",
};

/** « et Marie » si prénom co-contact, sinon chaîne vide. */
export function formatCoContactEtPrenom(coContactPrenom?: string | null): string {
  const prenom = coContactPrenom?.trim() ?? "";
  return prenom ? ` et ${prenom}` : "";
}

export function coContactFieldsForRecipient(
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
  ): PipeRdvCoContactFields {
  if (
    pipe.secondary_contact_id != null &&
    pipe.secondary_contact_id > 0 &&
    recipientContactId === pipe.contact_id
  ) {
    const co_contact_prenom = pipe.secondary_contact_prenom?.trim() ?? "";
    return {
      co_contact: formatPipeRdvParticipantNomPrenom(
        pipe.secondary_contact_prenom,
        pipe.secondary_contact_nom
      ),
      co_contact_prenom,
      co_contact_nom: pipe.secondary_contact_nom?.trim() ?? "",
      co_contact_et_prenom: formatCoContactEtPrenom(co_contact_prenom),
    };
  }
  if (
    pipe.secondary_contact_id != null &&
    recipientContactId === pipe.secondary_contact_id
  ) {
    const co_contact_prenom = pipe.contact_prenom?.trim() ?? "";
    return {
      co_contact: formatPipeRdvParticipantNomPrenom(pipe.contact_prenom, pipe.contact_nom),
      co_contact_prenom,
      co_contact_nom: pipe.contact_nom?.trim() ?? "",
      co_contact_et_prenom: formatCoContactEtPrenom(co_contact_prenom),
    };
  }
  return EMPTY_CO_CONTACT;
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
  return coContactFieldsForRecipient(pipe, recipientContactId).co_contact;
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
  const co = coContactFieldsForRecipient(options.pipe, options.recipientContactId);
  return {
    date_rdv: formatPipeRdvEmailDate(options.startAtUnix),
    heure_rdv: formatPipeRdvEmailTime(options.startAtUnix),
    heure_fin_rdv: formatPipeRdvEmailTime(options.endAtUnix),
    lien_visio,
    lieu_rdv,
    ...co,
  };
}
