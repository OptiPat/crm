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
import type { ScpiClientDeclarationInput } from "@/lib/espace-client/scpi-client-tracking";

import { ClientPreviewRdvButton } from "./ClientPreviewRdvButton";
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

  viewport: ClientPreviewViewport;

  emptyState?: ClientPreviewEmptyState;

  timelineLoading?: boolean;

  lastSyncLabel?: string | null;

  /** Cadre simulateur conseiller — désactivé sur le portail client. */
  showDeviceFrame?: boolean;

  /** Masque la ligne de synchro en bas de timeline (ex. déjà dans l'en-tête portail). */
  hideTimelineSync?: boolean;

  /** Historiques de valorisation (CRM) pour affiner la courbe d'évolution. */
  evolutionHistoriesByInvestissementId?: EvolutionHistoryById;

  enableScpiTracking?: boolean;
  scpiDeclarationSubmitting?: boolean;
  onSubmitScpiDeclaration?: (
    input: ScpiClientDeclarationInput
  ) => Promise<void>;

  /** Adresse du bouton permanent de rendez-vous. Absente : aucun bouton. */
  rdvUrl?: string;

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

  enableScpiTracking = false,

  scpiDeclarationSubmitting = false,

  onSubmitScpiDeclaration,

  rdvUrl,

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

    <div
      className={`${CP.root} flex w-full flex-col items-center py-1 md:py-2`}
      data-cp-viewport={viewport}
    >

      <ClientPreviewDeviceFrame viewport={viewport} framed={showDeviceFrame}>

        {showHeader ? (
          <ClientPreviewHeader
            prenom={contact.prenom}
            nom={contact.nom}
            logoUrl={logoUrl}
            lastSyncLabel={lastSyncLabel}
            viewport={viewport}
            onLogout={onLogout}
          />
        ) : null}

        {headerSlot}

        <ClientPreviewHero
          contact={contact}
          perimetre={perimetre}
          valorisationLabel={valorisationLabel}
          viewport={viewport}
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

          viewport={viewport}

        />

        <ClientPreviewInventory

          sortedInventory={sortedInventory}

          partenaireById={partenaireById}

          viewport={viewport}

          valorisationHistoriesByInvestissementId={
            evolutionHistoriesByInvestissementId
          }

          enableScpiTracking={enableScpiTracking}

          scpiDeclarationSubmitting={scpiDeclarationSubmitting}

          onSubmitScpiDeclaration={onSubmitScpiDeclaration}

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

      </ClientPreviewDeviceFrame>

    </div>

  );

}

