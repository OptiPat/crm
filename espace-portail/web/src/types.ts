import type { ValorisationPointDto } from "@/lib/espace-client/espace-valorisations";

export interface EspaceClientPartenaireLine {
  id: number;
  raisonSociale: string;
  urlExtranet?: string | null;
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

export interface EspaceClientScpiDeclarationLine {
  id: number;
  investissementId: number;
  dateTs: number;
  valorisationCentimes: number;
  revenuPercuCentimes?: number | null;
  createdAt: number;
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
  /**
   * Historique de valorisation étiqueté par source. Absent des snapshots
   * antérieurs au schéma 6 : le client ne voit alors que ses déclarations,
   * comme avant.
   */
  valorisations?: ValorisationPointDto[];
  /** Absent des anciens snapshots : le bouton disparaît alors, sans erreur. */
  rdvUrl?: string | null;
  /** Déclarations SCPI en attente de sync CRM — injectées par le portail. */
  scpiClientDeclarations?: EspaceClientScpiDeclarationLine[];
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
