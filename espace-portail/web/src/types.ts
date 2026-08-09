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
  timeline: EspaceClientTimelineEvent[];
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
}

export interface EspaceClientTimelineEvent {
  id: string;
  kind: string;
  date: number;
  label: string;
  detail?: string | null;
  typeProduit?: string | null;
  origine?: string | null;
}

export interface PatrimoineApiResponse {
  contactId: number;
  sequence: number;
  syncedAt: number;
  payload: EspaceClientSyncPayload;
}
