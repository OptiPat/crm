/** Champs saisis à chaque dossier de souscription CIF (hors profil conseiller). */
import type {
  OrigineFondsKey,
  ProvenanceFonds,
} from "@/lib/souscription-cif/annexes-scpi-origine-fonds";
import type { CapitalInvestAnnexeSouscription } from "@/lib/souscription-cif/capital-invest-annexe-souscriptions";
import type { ScpiAnnexeSouscription } from "@/lib/souscription-cif/scpi-annexe-souscriptions";
import {
  buildMesPreconisationsFromSouscriptions,
  defaultScpiAnnexeSouscriptions,
} from "@/lib/souscription-cif/scpi-annexe-souscriptions";

export type { CapitalInvestAnnexeSouscription, ScpiAnnexeSouscription };
export type { OrigineFondsKey, ProvenanceFonds };

export type SouscriptionDossierFields = {
  dateDoc: string;
  dateDer: string;
  dateRio: string;
  dateQpi: string;
  lieuNaissance: string;
  objectifsClient: string;
  /** Rapport de mission — rappel de la demande. */
  rappelDemande: string;
  /** Rapport de mission — puces situation client (Recueil / QPI). */
  rappelSituationClient: string;
  /** Rapport de mission — analyse personnalisée (R1, projet, lien avec la préconisation). */
  analyseSituationClient: string;
  /** Annexes — paragraphe de conseil (préconisation SCPI). */
  conseil: string;
  /** Annexes — préconisations détaillées (montants, parts, VP…) — texte libre dans l'aperçu. */
  mesPreconisations: string;
  /** Annexes — souscriptions SCPI structurées (montants, prix part, réinvest., VP, fiches). */
  scpiAnnexeSouscriptions: ScpiAnnexeSouscription[];
  /** Annexes Capital invest — souscriptions FCPI / FIP (nb parts, prix part, droit d'entrée). */
  capitalInvestAnnexeSouscriptions: CapitalInvestAnnexeSouscription[];
  /** Annexes Capital invest — fiches produit (texte libre, ex. millésime). */
  descriptionsCapitalInvest: string;
  /** Annexes G3F — rendement affiché au § 3 (ex. « 11 % »). */
  g3fRendement: string;
  /** Annexes G3F — année de l'impôt estimé (§ calcul investissement). */
  g3fAnneeImpot: string;
  /** Annexes G3F — montant impôt estimé (€, saisi). */
  g3fMontantImpotEur: string;
  /** Annexes G3F — réduction d'impôt souhaitée (€). */
  g3fReductionSouhaiteeEur: string;
  /** Annexes G3F — montant apport nécessaire (€). */
  g3fMontantApportEur: string;
  /** Annexes G3F — frais d'enregistrement (€). */
  g3fFraisEnregistrementEur: string;
  /** Annexes G3F — total apport (€) ; si vide, apport + frais. */
  g3fTotalApportEur: string;
  /** Annexes G3F — année loi de finances (calendrier fiscal). */
  g3fAnneeLoiFinances: string;
  /** Annexes G3F — année de souscription. */
  g3fAnneeSouscription: string;
  /** Annexes G3F — année déclaration de revenus (dérive avril/mai et été dans le texte). */
  g3fAnneeDeclarationRevenus: string;
  /** Annexes — attestation CIF : quote-part perçue consultant (€). */
  quotePartPercueConsultantCifEur: string;
  /** Annexes — provenance des fonds (§ 5 page 7). */
  provenanceFonds: ProvenanceFonds;
  /** Annexes — origines des fonds cochées (§ 5 page 7). */
  origineFondsSelected: OrigineFondsKey[];
  /** Précision si « Autre » origine des fonds. */
  origineFondsAutrePrecision: string;
};

export function todayDateInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function defaultSouscriptionDossierFields(): SouscriptionDossierFields {
  return {
    dateDoc: todayDateInputValue(),
    dateDer: "",
    dateRio: "",
    dateQpi: "",
    lieuNaissance: "",
    objectifsClient: "",
    rappelDemande: "",
    rappelSituationClient: "",
    analyseSituationClient: "",
    conseil: "",
    mesPreconisations: "",
    scpiAnnexeSouscriptions: [],
    capitalInvestAnnexeSouscriptions: [],
    descriptionsCapitalInvest: "",
    g3fRendement: "",
    g3fAnneeImpot: "",
    g3fMontantImpotEur: "",
    g3fReductionSouhaiteeEur: "",
    g3fMontantApportEur: "",
    g3fFraisEnregistrementEur: "",
    g3fTotalApportEur: "",
    g3fAnneeLoiFinances: "",
    g3fAnneeSouscription: "",
    g3fAnneeDeclarationRevenus: "",
    quotePartPercueConsultantCifEur: "",
    provenanceFonds: "",
    origineFondsSelected: [],
    origineFondsAutrePrecision: "",
  };
}

export function defaultAnnexesSouscriptionDossierPatch(): Pick<
  SouscriptionDossierFields,
  "scpiAnnexeSouscriptions" | "mesPreconisations"
> {
  const scpiAnnexeSouscriptions = defaultScpiAnnexeSouscriptions();
  return {
    scpiAnnexeSouscriptions,
    mesPreconisations: buildMesPreconisationsFromSouscriptions(scpiAnnexeSouscriptions),
  };
}
