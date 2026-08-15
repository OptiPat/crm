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
  /**
   * Nature décidée par le CRM. Absentes des photos antérieures au schéma 7 :
   * l'écran considère alors la ligne comme non modifiable, exactement comme
   * l'API, plutôt que d'afficher un bouton qui serait refusé.
   */
  estImmobilier?: boolean;
  estScpi?: boolean;
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
  /** Favori client, injecté par le portail — jamais présent dans le snapshot CRM. */
  extranetUrl?: string | null;
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
  /** Bouton WhatsApp flottant. Absent des anciens snapshots : pas de bouton. */
  whatsappUrl?: string | null;
  /** Identité du conseiller (profil CRM). Absente des snapshots antérieurs au schéma 8. */
  advisor?: {
    prenom?: string | null;
    nom?: string | null;
    telephone?: string | null;
  } | null;
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
