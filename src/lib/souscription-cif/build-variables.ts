import type { Contact } from "@/lib/api/tauri-contacts";
import type { Document } from "@/lib/api/tauri-documents";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { latestQpiExperienceInvestissement } from "@/lib/documents/qpi-document-utils";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { formatDateInputFr } from "@/lib/souscription-cif/format-date-input-fr";
import { normalizeRappelSituationClient } from "@/lib/souscription-cif/build-rappel-situation-default";
import {
  buildDureeBlocageCapitalInvestAnneesVariable,
  buildProduitsCapitalInvestCiblesVariable,
} from "@/lib/souscription-cif/annexes-capital-invest-recap-table";
import { buildDescriptionsScpiFromKeys } from "@/lib/souscription-cif/scpi-annexe-catalog";
import {
  getScpiAnnexeProductKeysFromSouscriptions,
} from "@/lib/souscription-cif/scpi-annexe-souscriptions";
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
    duree_blocage_capital_invest_annees: buildDureeBlocageCapitalInvestAnneesVariable(dossier),
    cgp_nom_complet: cgpNomComplet(cgp),
    cgp_cabinet: cgpCabinet(cgp),
    cgp_representant_legal: cgpRepresentantLegal(cgp),
    cgp_formule_politesse: cgpFormulePolitesse(cgp),
    cgp_rcs_ville: cgp?.cif_rcs_ville?.trim() || null,
    cgp_siren: sirenRaw,
    cgp_siren_compact: sirenCompact,
    cgp_adresse_ligne: cgp?.adresse?.trim() || null,
    cgp_cp_ville: cgp ? joinCpVille(cgp.code_postal, cgp.ville) : null,
    cgp_anacofi_numero: cgp?.cif_anacofi_numero?.trim() || null,
    cgp_orias: cgp?.cif_orias?.trim() || null,
  };
}
