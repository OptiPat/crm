export interface EspaceClientPartenaireLine {
  id: number;
  raisonSociale: string;
  urlExtranet?: string | null;
}

export interface EspaceClientSyncPayload {
  schemaVersion: number;
  sequence: number;
  generatedAt: number;
  contact: {
    contactId: number;
    prenom: string;
    nom: string;
  };
  acces: {
    statut: string;
    emailUtilise?: string | null;
  };
  investissements: EspaceClientInvestissementLine[];
  partenaires?: EspaceClientPartenaireLine[];
  timeline: EspaceClientTimelineEvent[];
  /** Absent des anciens snapshots : le bouton disparaît alors, sans erreur. */
  rdvUrl?: string | null;
}

export interface EspaceClientInvestissementLine {
  id: number;
  typeProduit: string;
  partenaireId?: number | null;
  nomProduit: string;
  montantInitial?: number | null;
  encoursActuel?: number | null;
  encoursDate?: number | null;
  origine: string;
  statut: string;
  dateSouscription?: number | null;
  dateFinDemembrement?: number | null;
  dateFinPret?: number | null;
  dateProchainArbitrage?: number | null;
  derniereMajClient?: number | null;
  mensualiteCredit?: number | null;
  creditCrd?: number | null;
  loyerMensuel?: number | null;
  urlContrat?: string | null;
  versementProgramme?: boolean;
  montantVersementProgramme?: number | null;
  frequenceVersement?: string | null;
  reinvestissementDividendes?: boolean;
  reinvestissementPourcent?: number | null;
}

export interface EspaceClientTimelineEvent {
  id: string;
  kind: string;
  date: number;
  label: string;
  detail?: string | null;
  typeProduit?: string | null;
  origine?: string | null;
  /** Échéance du conseiller proposant une prise de rendez-vous. */
  rdvUrl?: string | null;
}

export interface PatrimoineApiResponse {
  contactId: number;
  sequence: number;
  syncedAt: number;
  payload: EspaceClientSyncPayload;
}
