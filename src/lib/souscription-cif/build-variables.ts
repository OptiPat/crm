import type { Contact } from "@/lib/api/tauri-contacts";
import type { Document } from "@/lib/api/tauri-documents";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import {
  associationCifMentions,
  resolveAssociationCif,
} from "@/lib/souscription-cif/association-cif";
import { latestQpiExperienceInvestissement } from "@/lib/documents/qpi-document-utils";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { formatDateInputFr } from "@/lib/souscription-cif/format-date-input-fr";
import { normalizeRappelSituationClient } from "@/lib/souscription-cif/build-rappel-situation-default";
import { buildProduitsCapitalInvestCiblesVariable } from "@/lib/souscription-cif/annexes-capital-invest-recap-table";
import { buildDescriptionsScpiFromKeys } from "@/lib/souscription-cif/scpi-annexe-catalog";
import {
  getScpiAnnexeProductKeysFromSouscriptions,
} from "@/lib/souscription-cif/scpi-annexe-souscriptions";
import { buildG3fInvestmentVariables } from "@/lib/souscription-cif/build-g3f-investment-calc";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

function joinCpVille(cp?: string | null, ville?: string | null): string | null {
  const parts = [cp?.trim(), ville?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function cgpNomComplet(cgp: CgpConfig | null): string | null {
  if (!cgp) return null;
  const s = [cgp.prenom?.trim(), cgp.nom?.trim()].filter(Boolean).join(" ");
  return s || null;
}

function cgpCabinet(cgp: CgpConfig | null): string | null {
  return cgp?.cabinet?.trim() || null;
}

/**
 * Registre choisi dans le profil. `null` tant qu'il n'est pas réglé : les mentions qui en
 * dépendent restent « à compléter » plutôt que d'afficher un registre peut-être faux.
 */
function cgpRegistre(cgp: CgpConfig | null): "RCS" | "RSAC" | "RNE" | null {
  const r = cgp?.cif_registre;
  return r === "RCS" || r === "RNE" || r === "RSAC" ? r : null;
}

/** Forme d'exercice choisie dans le profil ; `null` tant qu'elle n'est pas réglée. */
function cgpFormeExercice(cgp: CgpConfig | null): "nom_propre" | "societe" | null {
  const f = cgp?.cif_forme_exercice;
  return f === "nom_propre" || f === "societe" ? f : null;
}

function cgpExerceEnNomPropre(cgp: CgpConfig | null): boolean {
  return cgpFormeExercice(cgp) === "nom_propre";
}

/**
 * En-tête « le Conseiller » : entrepreneur individuel (mention « entrepreneur individuel »
 * obligatoire, C. com. L. 526-22) ou société représentée par son gérant.
 * `null` (champ à compléter) si la forme d'exercice n'est pas réglée.
 */
function cgpDesignation(cgp: CgpConfig | null): string | null {
  const nom = cgpNomComplet(cgp);
  const cabinet = cgpCabinet(cgp);
  if (cgpFormeExercice(cgp) == null) return null;
  if (cgpExerceEnNomPropre(cgp)) {
    if (!nom) return null;
    return cabinet
      ? `${nom}, entrepreneur individuel, exerçant sous le nom commercial ${cabinet}`
      : `${nom}, entrepreneur individuel`;
  }
  if (!cabinet || !nom) return null;
  return `La société ${cabinet}, représentée par ${nom} en qualité de gérant`;
}

/**
 * Ligne d'immatriculation : « immatriculé au Registre national des entreprises sous le
 * numéro … » (RNE, sans greffe) ou « immatriculé(e) au RCS / RSAC de <ville> sous le
 * numéro … ». `null` (champ à compléter) si le SIREN, ou la ville du greffe, manque.
 */
function cgpImmatriculation(cgp: CgpConfig | null): string | null {
  const siren = cgp?.cif_siren?.trim();
  const registre = cgpRegistre(cgp);
  if (!siren || !registre || cgpFormeExercice(cgp) == null) return null;
  const accord = cgpImmatriculeAccord(cgp);
  if (registre === "RNE") {
    return `${accord} au Registre national des entreprises sous le numéro ${siren}`;
  }
  const ville = cgp?.cif_rcs_ville?.trim();
  return ville ? `${accord} au ${registre} de ${ville} sous le numéro ${siren}` : null;
}

function cgpImmatriculeAccord(cgp: CgpConfig | null): string {
  const forme = cgpFormeExercice(cgp);
  if (forme === "nom_propre") return "immatriculé";
  if (forme === "societe") return "immatriculée";
  return "immatriculé(e)";
}

/** Pied de page : « RNE », « RCS <ville> » ou « RSAC <ville> » (`null` si non réglé). */
function cgpRegistrePied(cgp: CgpConfig | null): string | null {
  const registre = cgpRegistre(cgp);
  if (!registre) return null;
  if (registre === "RNE") return "RNE";
  const ville = cgp?.cif_rcs_ville?.trim();
  return ville ? `${registre} ${ville}` : null;
}

/** Signature RTO : le cabinet (société) ou le conseiller en nom propre. */
function cgpSignataire(cgp: CgpConfig | null): string | null {
  const forme = cgpFormeExercice(cgp);
  if (forme === "nom_propre") return cgpNomComplet(cgp);
  if (forme === "societe") return cgpCabinet(cgp);
  return null;
}

function cgpSignataireTitre(cgp: CgpConfig | null): string | null {
  const forme = cgpFormeExercice(cgp);
  if (forme === "nom_propre") return "Entrepreneur individuel";
  if (forme === "societe") return "Gérant";
  return null;
}

function cgpRepresentantLegal(cgp: CgpConfig | null): string | null {
  const nom = cgpNomComplet(cgp);
  return nom ? `${nom} en qualité de gérant` : null;
}

/** Ex. « Jean DUPONT, » — formule d'appel au conseiller (page 8 annexes). */
function cgpFormulePolitesse(cgp: CgpConfig | null): string | null {
  const nomPrenom = cgpNomComplet(cgp);
  return nomPrenom ? `${nomPrenom},` : null;
}

export function buildSouscriptionVariables(
  contact: Contact | null,
  cgp: CgpConfig | null,
  dossier: SouscriptionDossierFields,
  documents: readonly Document[] = []
): Record<string, string | null> {
  const sirenRaw = cgp?.cif_siren?.trim() || null;
  const sirenCompact = sirenRaw ? sirenRaw.replace(/\s+/g, "") : null;
  const association = resolveAssociationCif(cgp?.cif_association);
  // Numéro conservé en config au changement d'association, mais jamais cité pour la CNCEF.
  const associationNumero = association.avecNumero
    ? cgp?.cif_association_numero?.trim() || null
    : null;
  const associationMentions = associationCifMentions(cgp?.cif_association, associationNumero);

  return {
    client_nom_prenom: contact
      ? [contact.prenom?.trim(), contact.nom?.trim()].filter(Boolean).join(" ") || null
      : null,
    client_adresse: contact?.adresse?.trim() || null,
    client_cp_ville: contact ? joinCpVille(contact.code_postal, contact.ville) : null,
    client_ville: contact?.ville?.trim() || null,
    client_telephone: contact?.telephone?.trim() || null,
    client_date_naissance:
      contact?.date_naissance != null ? formatCalendarDateFr(contact.date_naissance) : null,
    client_lieu_naissance:
      dossier.lieuNaissance.trim() || contact?.lieu_naissance?.trim() || null,
    date_document: formatDateInputFr(dossier.dateDoc),
    date_der: formatDateInputFr(dossier.dateDer),
    date_rio: formatDateInputFr(dossier.dateRio),
    date_qpi: formatDateInputFr(dossier.dateQpi),
    niveau_experience_qpi: latestQpiExperienceInvestissement(documents),
    objectifs_client: dossier.objectifsClient.trim() || null,
    rappel_demande: dossier.rappelDemande.trim() || null,
    rappel_situation_client:
      normalizeRappelSituationClient(dossier.rappelSituationClient.trim()) || null,
    analyse_situation_client: dossier.analyseSituationClient.trim() || null,
    conseil: dossier.conseil.trim() || null,
    mes_preconisations: dossier.mesPreconisations.trim() || null,
    descriptions_scpi:
      buildDescriptionsScpiFromKeys(
        getScpiAnnexeProductKeysFromSouscriptions(dossier.scpiAnnexeSouscriptions)
      ) || null,
    descriptions_capital_invest: dossier.descriptionsCapitalInvest.trim() || null,
    produits_capital_invest_cibles: buildProduitsCapitalInvestCiblesVariable(
      dossier.capitalInvestAnnexeSouscriptions
    ),
    g3f_rendement: dossier.g3fRendement.trim() || null,
    ...buildG3fInvestmentVariables(dossier),
    cgp_nom_complet: cgpNomComplet(cgp),
    cgp_cabinet: cgpCabinet(cgp),
    cgp_representant_legal: cgpRepresentantLegal(cgp),
    cgp_formule_politesse: cgpFormulePolitesse(cgp),
    cgp_designation: cgpDesignation(cgp),
    cgp_immatriculation: cgpImmatriculation(cgp),
    /** Accord pour les autres mentions (ORIAS) : « immatriculé » / « immatriculée ». */
    cgp_immatricule: cgpImmatriculeAccord(cgp),
    cgp_signataire: cgpSignataire(cgp),
    cgp_signataire_titre: cgpSignataireTitre(cgp),
    cgp_registre_pied: cgpRegistrePied(cgp),
    cgp_rcs_ville: cgp?.cif_rcs_ville?.trim() || null,
    cgp_siren: sirenRaw,
    cgp_siren_compact: sirenCompact,
    cgp_adresse_ligne: cgp?.adresse?.trim() || null,
    cgp_cp_ville: cgp ? joinCpVille(cgp.code_postal, cgp.ville) : null,
    cgp_association: association.nom,
    cgp_association_adhesion: associationMentions.adhesion,
    cgp_association_aupres: associationMentions.aupres,
    cgp_association_membre: associationMentions.membre,
    cgp_association_numero: associationNumero,
    /** Ancien nom, conservé pour les pieds de page personnalisés existants. */
    cgp_anacofi_numero: associationNumero,
    cgp_orias: cgp?.cif_orias?.trim() || null,
  };
}
