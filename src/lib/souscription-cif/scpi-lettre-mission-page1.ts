/** Page 1 — Lettre de mission CIF (corps après le titre + pied de page). */

export const SCPI_LM_PAGE1_BODY_AFTER_TITLE = `Je vous ai transmis lors de notre premier entretien du {{date_der}} un document comportant les mentions prévues à l'article 325-3 du Règlement général de l'AMF dont vous avez pu prendre connaissance. Par ailleurs, vous avez bien voulu me communiquer un certain nombre d'informations dont la finalité était de me permettre :
- De procéder à l'analyse de votre situation financière et patrimoniale ;
- D'appréhender vos connaissances et expériences des marchés financiers ;
- De recueillir vos objectifs afin d'adapter ma mission de conseil à votre profil et à vos attentes.

La présente lettre de mission est, en conséquence, établie sur la base des éléments susvisés avec pour objet, conformément aux normes d'exercice professionnel édictées par l'Anacofi CIF, association à laquelle je suis adhérent, de vous proposer une étude patrimoniale et des préconisations de solutions patrimoniales afin d'identifier les problématiques et attentes patrimoniales à partir des informations que vous avez bien voulu me communiquer.
C'est dans ces circonstances que le Client et le Conseiller se sont ensuite rapprochés en vue de définir par la présente lettre de mission (la « Lettre de Mission »), les termes de la mission confiée au Conseiller au titre de l'exécution des Prestations convenues entre les Parties.

[u]Identification des intervenants :[/u]

Entre les soussignés :
{{client_nom_prenom}}, {{client_date_naissance}} à {{client_lieu_naissance}}
{{client_adresse}} – {{client_cp_ville}}
Tel : {{client_telephone}}

Ci-après désigné comme « le Client »,

ET

{{cgp_nom_complet}}
immatriculé au RCS de {{cgp_rcs_ville}} sous le numéro {{cgp_siren}}
dont le siège est situé {{cgp_adresse_ligne}} – {{cgp_cp_ville}}
est titulaire du statut de Conseiller en Investissements Financiers
enregistré sous le n°{{cgp_anacofi_numero}} auprès de l'Anacofi CIF
Association agréée par l'Autorité des Marchés Financiers

Ci-après désigné « Le Conseiller ».`;

/** @deprecated Corps complet — préférer SCPI_LM_PAGE1_BODY_AFTER_TITLE + en-tête structuré. */
export const SCPI_LM_PAGE1_BODY = SCPI_LM_PAGE1_BODY_AFTER_TITLE;
export const SCPI_LM_PAGE1_FOOTER_DEFAULT = `Conseiller en Investissements Financiers, membre n° {{cgp_anacofi_numero}} de l'ANACOFI – CIF - Association agréée par l'Autorité des Marchés Financiers-Mandataire d'intermédiaire en Assurance de Stellium Courtage - ORIAS n°{{cgp_orias}} www.orias.fr, sous le contrôle de l'Autorité de Contrôle Prudentiel et de Résolution (ACPR) 04 Place de Budapest – 75436 PARIS cedex 09
Mandataire d'intermédiaire en Opérations de Banque et en Services de Paiement de Stellium Financement sous le contrôle de l'ACPR (Autorité de Contrôle Prudentiel et de Résolution), 4 Place de Budapest, CS 92459, 75436 Paris Cedex 09
Attestation de collaborateur de Stellium Immobilier n° CPI 3101 2015 000 001 813 délivrée par la CCI de Toulouse
Assurance Responsabilité Civile Professionnelle conforme au code des Assurances auprès de ZURICH INSURANCE PLC, 112 Avenue de Wagram, 75017 Paris-N° SIREN {{cgp_siren_compact}} RSAC {{cgp_rcs_ville}}- Siège social : {{cgp_adresse_ligne}}, {{cgp_cp_ville}}`;

/** Libellés FR pour les champs manquants dans l'aperçu. */
export const SOUSCRIPTION_VARIABLE_LABELS: Record<string, string> = {
  client_nom_prenom: "Nom & prénom client",
  client_adresse: "Adresse client",
  client_cp_ville: "Code postal & ville client",
  client_ville: "Ville client",
  client_telephone: "Téléphone client",
  client_date_naissance: "Date de naissance client",
  client_lieu_naissance: "Lieu de naissance client",
  date_document: "Date du document",
  date_der: "Date du premier entretien (DER)",
  date_rio: "Date de signature du RIO",
  date_qpi: "Date de signature du QPI",
  objectifs_client: "Objectifs client (contexte prestation)",
  rappel_demande: "Rappel de la demande",
  rappel_situation_client: "Rappel situation client (Recueil / QPI)",
  conseil: "Conseil (résumé préconisation)",
  mes_preconisations: "Mes préconisations",
  descriptions_scpi: "Descriptions SCPI",
  cgp_nom_complet: "Nom du conseiller",
  cgp_rcs_ville: "Ville RCS",
  cgp_siren: "N° SIREN",
  cgp_siren_compact: "N° SIREN (sans espaces)",
  cgp_adresse_ligne: "Adresse du siège",
  cgp_cp_ville: "Code postal & ville siège",
  cgp_anacofi_numero: "N° Anacofi CIF",
  cgp_orias: "N° ORIAS",
};
