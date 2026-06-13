/** Champs saisis à chaque dossier de souscription CIF (hors profil conseiller). */
export type SouscriptionDossierFields = {
  dateDoc: string;
  dateDer: string;
  dateRio: string;
  dateQpi: string;
  lieuNaissance: string;
  objectifsClient: string;
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
  };
}
