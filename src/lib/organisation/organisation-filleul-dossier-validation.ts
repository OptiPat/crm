import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import {
  buildUpsertFilleulDossierInput,
  resolveFilleulDesinscriptionTimestamp,
  resolveFilleulInscriptionTimestamp,
  resolveFilleulInvitationTimestamp,
} from "@/lib/organisation/organisation-filleul-dossier";
import {
  isOrganisationNetworkConsultant,
  wasConsultantInNetworkDuringExercice,
} from "@/lib/organisation/organisation-exercice-membership";
import {
  currentFiscalYearLabel,
  fiscalYearEndUnix,
  fiscalYearStartUnix,
} from "@/lib/pipe/remuneration-fiscal-year";

type DossierDatePatch = Partial<{
  dateInvitation: string;
  dateInscription: string;
  dateDesinscription: string;
}>;

export type FilleulDossierDateValidation = {
  blocking?: string;
  warning?: string;
};

/** Dates effectives après application d'un patch sur le dossier. */
export function resolveFilleulDossierDatesAfterPatch(
  dossier: FilleulDossier,
  contact: Pick<Contact, "date_invitation_filleul" | "date_inscription_filleul">,
  patch: DossierDatePatch
): {
  invitation: number | null;
  inscription: number | null;
  desinscription: number | null;
} {
  const upsert = buildUpsertFilleulDossierInput(dossier, patch);
  const merged: FilleulDossier = {
    ...dossier,
    dateInvitation: upsert.dateInvitation ?? null,
    dateInscription: upsert.dateInscription ?? null,
    dateDesinscription: upsert.dateDesinscription ?? null,
  };
  return {
    invitation: resolveFilleulInvitationTimestamp(contact, merged) ?? null,
    inscription: resolveFilleulInscriptionTimestamp(contact, merged) ?? null,
    desinscription: resolveFilleulDesinscriptionTimestamp(merged) ?? null,
  };
}

export function validateFilleulDossierDatePatch(
  dossier: FilleulDossier,
  contact: Pick<Contact, "date_invitation_filleul" | "date_inscription_filleul">,
  patch: DossierDatePatch
): FilleulDossierDateValidation | null {
  const { invitation, inscription, desinscription } = resolveFilleulDossierDatesAfterPatch(
    dossier,
    contact,
    patch
  );

  if (
    desinscription != null &&
    inscription != null &&
    desinscription < inscription
  ) {
    return {
      blocking:
        "La date de désinscription ne peut pas être antérieure à la date d'inscription.",
    };
  }

  if (
    desinscription != null &&
    invitation != null &&
    inscription == null &&
    desinscription < invitation
  ) {
    return {
      blocking:
        "La date de désinscription ne peut pas être antérieure à la date d'invitation.",
    };
  }

  if (
    inscription != null &&
    invitation != null &&
    inscription < invitation
  ) {
    return {
      warning:
        "L'inscription est antérieure à l'invitation — vérifiez les dates saisies.",
    };
  }

  return null;
}

/** Indique pourquoi un consultant peut être absent de l'arbre sur l'exercice affiché. */
export function describeOrganisationExerciceVisibilityHint(
  contact: Pick<
    Contact,
    "id" | "categorie" | "filleul_categorie" | "date_inscription_filleul"
  >,
  dossier: FilleulDossier | null | undefined,
  exerciceLabel = currentFiscalYearLabel()
): string | null {
  // Un prospect/suspect filleul n'est jamais attendu dans l'arbre par exercice (réservé aux
  // consultants FILLEUL / FILLEUL_DESINSCRIT) : pas de faux « absent de l'arbre » pour eux.
  if (!isOrganisationNetworkConsultant(contact)) return null;

  const dossiersByContactId = new Map<number, FilleulDossier>();
  if (contact.id != null && dossier) {
    dossiersByContactId.set(contact.id, dossier);
  }

  if (
    wasConsultantInNetworkDuringExercice(contact, exerciceLabel, dossiersByContactId)
  ) {
    return null;
  }

  const start = fiscalYearStartUnix(exerciceLabel);
  const end = fiscalYearEndUnix(exerciceLabel);
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  const desinscription = resolveFilleulDesinscriptionTimestamp(dossier);

  if (inscription != null && end != null && inscription > end) {
    return `Inscrit après l'exercice ${exerciceLabel} — consultez un exercice plus récent ou la recherche consultant.`;
  }

  if (desinscription != null && start != null && desinscription < start) {
    return `Sorti du réseau avant le début de l'exercice ${exerciceLabel} (01/08) — affiché sur les exercices précédents ou via la recherche consultant.`;
  }

  return `Absent de l'arbre sur l'exercice ${exerciceLabel} — utilisez la recherche consultant ou un autre exercice.`;
}
