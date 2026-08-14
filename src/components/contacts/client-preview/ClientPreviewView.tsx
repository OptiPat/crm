import { useMemo, type ReactNode } from "react";

import type { Contact } from "@/lib/api/tauri-contacts";

import type { Investissement } from "@/lib/api/tauri-investissements";

import type { Partenaire } from "@/lib/api/tauri-partenaires";

import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";

import type { PatrimoineChartSlice } from "@/lib/patrimoine/patrimoine-charts";

import type { PerimetrePatrimoine } from "@/lib/patrimoine/perimetre";

import type { PatrimoineTimelineEvent } from "@/lib/patrimoine/timeline";

import type { ClientPreviewViewport } from "./ClientPreviewAdvisorPanel";

import { ClientPreviewDeviceFrame } from "./ClientPreviewDeviceFrame";

import { ClientPreviewHero, type ClientPreviewEmptyState } from "./ClientPreviewHero";

import { ClientPreviewCharts } from "./ClientPreviewCharts";

import { ClientPreviewInventory } from "./ClientPreviewInventory";

import { ClientPreviewEvolution } from "./ClientPreviewEvolution";
import type { EvolutionHistoryById } from "./ClientPreviewEvolution";
import type {
  ClientInvestissementNatureById,
  ClientInvestissementUpdateInput,
} from "@/lib/espace-client/client-investissement-update";
import type { ClientAvoirDeclarationInput } from "@/lib/espace-client/client-avoir-declaration";

import { ClientPreviewRdvButton } from "./ClientPreviewRdvButton";
import { ClientPreviewWhatsAppFab } from "./ClientPreviewWhatsAppFab";
import { ClientPreviewHeader } from "./ClientPreviewHeader";

import { ClientPreviewTimeline } from "./ClientPreviewTimeline";

import { getLatestValorisationLabel } from "./client-preview-format";

import { CP } from "./client-preview-theme";

import "./client-preview.css";



export interface ClientPreviewViewProps {

  contact: Contact;

  visible: Investissement[];

  partenaireById: Map<number, Partenaire>;

  perimetre: PerimetrePatrimoine;

  categorieData: PatrimoineChartSlice[];

  disponibiliteData: PatrimoineChartSlice[];

  timeline: PatrimoineTimelineEvent[];

  /** Cadre simulateur CRM uniquement. Ignoré sur le portail (`showDeviceFrame={false}`). */
  viewport?: ClientPreviewViewport;

  emptyState?: ClientPreviewEmptyState;

  timelineLoading?: boolean;

  lastSyncLabel?: string | null;

  /** Cadre simulateur conseiller — désactivé sur le portail client. */
  showDeviceFrame?: boolean;

  /** Masque la ligne de synchro en bas de timeline (ex. déjà dans l'en-tête portail). */
  hideTimelineSync?: boolean;

  /** Historiques de valorisation (CRM) pour affiner la courbe d'évolution. */
  evolutionHistoriesByInvestissementId?: EvolutionHistoryById;

  /**
   * Nature des lignes telle que la photo l'annonce. Fournie par le portail,
   * absente dans l'aperçu conseiller où le CRM est lui-même la source.
   */
  natureByInvestissementId?: ClientInvestissementNatureById;

  enableScpiTracking?: boolean;
  scpiDeclarationSubmitting?: boolean;
  onSubmitScpiDeclaration?: (
    input: ClientInvestissementUpdateInput
  ) => Promise<void>;

  enableAddAvoir?: boolean;
  avoirSubmitting?: boolean;
  onSubmitAvoir?: (input: ClientAvoirDeclarationInput) => Promise<void>;
  enableRetirerAvoir?: boolean;
  retirerSubmitting?: boolean;
  onRetirerAvoir?: (investissementId: number) => Promise<void>;

  /** Adresse du bouton permanent de rendez-vous. Absente : aucun bouton. */
  rdvUrl?: string;

  /** Lien wa.me du bouton WhatsApp flottant. Absente : aucun bouton. */
  whatsappUrl?: string;

  /** En-tête client : logo, titre, déconnexion. Masqué si absent. */
  showHeader?: boolean;

  /** Logo affiché dans l'en-tête. */
  logoUrl?: string;

  /** Déconnexion réelle côté portail ; inerte dans l'aperçu conseiller. */
  onLogout?: () => void;

  /**
   * Bloc inséré entre l'en-tête et le patrimoine — le portail y place les
   * documents demandés. L'aperçu conserve ainsi le même ordre d'écran.
   */
  headerSlot?: ReactNode;
}



export function ClientPreviewView({

  contact,

  visible,

  partenaireById,

  perimetre,

  categorieData,

  disponibiliteData,

  timeline,

  viewport,

  emptyState = null,

  timelineLoading = false,

  lastSyncLabel,

  showDeviceFrame = true,

  hideTimelineSync = false,

  evolutionHistoriesByInvestissementId,

  natureByInvestissementId,

  enableScpiTracking = false,

  scpiDeclarationSubmitting = false,

  onSubmitScpiDeclaration,

  enableAddAvoir = false,

  avoirSubmitting = false,

  onSubmitAvoir,

  enableRetirerAvoir = false,

  retirerSubmitting = false,

  onRetirerAvoir,

  rdvUrl,

  whatsappUrl,

  showHeader = false,

  logoUrl,

  onLogout,

  headerSlot,

}: ClientPreviewViewProps) {

  const valorisationLabel = useMemo(

    () => getLatestValorisationLabel(visible),

    [visible]

  );



  const sortedInventory = useMemo(

    () =>

      [...visible].sort(

        (a, b) =>

          getEffectiveEncoursCentimes(b) - getEffectiveEncoursCentimes(a)

      ),

    [visible]

  );



  return (

    <div className={`${CP.root} flex w-full flex-col items-center py-2`}>

      <ClientPreviewDeviceFrame viewport={viewport} framed={showDeviceFrame}>

        {showHeader ? (
          <ClientPreviewHeader
            prenom={contact.prenom}
            nom={contact.nom}
            logoUrl={logoUrl}
            lastSyncLabel={lastSyncLabel}
            onLogout={onLogout}
          />
        ) : null}

        {headerSlot}

        <ClientPreviewHero
          contact={contact}
          perimetre={perimetre}
          valorisationLabel={valorisationLabel}
          emptyState={emptyState}
        />

        {rdvUrl ? (
          <div className={`${CP.padX} mt-4`}>
            <ClientPreviewRdvButton url={rdvUrl} />
          </div>
        ) : null}

        <ClientPreviewCharts

          categorieData={categorieData}

          disponibiliteData={disponibiliteData}

        />

        <ClientPreviewInventory

          sortedInventory={sortedInventory}

          partenaireById={partenaireById}

          valorisationHistoriesByInvestissementId={
            evolutionHistoriesByInvestissementId
          }

          natureByInvestissementId={natureByInvestissementId}

          enableScpiTracking={enableScpiTracking}

          scpiDeclarationSubmitting={scpiDeclarationSubmitting}

          onSubmitScpiDeclaration={onSubmitScpiDeclaration}

          enableAddAvoir={enableAddAvoir}

          avoirSubmitting={avoirSubmitting}

          onSubmitAvoir={onSubmitAvoir}

          enableRetirerAvoir={enableRetirerAvoir}

          retirerSubmitting={retirerSubmitting}

          onRetirerAvoir={onRetirerAvoir}

          emptyState={emptyState}

        />

        <ClientPreviewEvolution
          investissements={sortedInventory}
          historiesByInvestissementId={evolutionHistoriesByInvestissementId}
        />

        <ClientPreviewTimeline

          timeline={timeline}

          loading={timelineLoading}

          lastSyncLabel={hideTimelineSync ? null : lastSyncLabel}

        />

        {whatsappUrl ? <ClientPreviewWhatsAppFab url={whatsappUrl} /> : null}

      </ClientPreviewDeviceFrame>

    </div>

  );

}

