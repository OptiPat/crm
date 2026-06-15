/** Champs saisis à chaque dossier de souscription CIF (hors profil conseiller). */
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
  /** Annexes — paragraphe de conseil (préconisation SCPI). */
  conseil: string;
  /** Annexes — préconisations détaillées (montants, parts, VP…). */
  mesPreconisations: string;
  /** Annexes — fiches SCPI sélectionnées (catalogue → `descriptions_scpi`). */
  scpiAnnexeProductKeys: string[];
  /** Annexes — attestation CIF : quote-part perçue consultant (€). */
  quotePartPercueConsultantCifEur: string;
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
    conseil: "",
    mesPreconisations: "",
    scpiAnnexeProductKeys: [],
    quotePartPercueConsultantCifEur: "",
  };
}
