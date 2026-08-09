import { useMemo } from "react";

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

      <ClientPreviewDeviceFrame viewport={viewport}>

        <ClientPreviewHero
          contact={contact}
          perimetre={perimetre}
          valorisationLabel={valorisationLabel}
          viewport={viewport}
          emptyState={emptyState}
        />

        <ClientPreviewCharts

          categorieData={categorieData}

          disponibiliteData={disponibiliteData}

          viewport={viewport}

        />

        <ClientPreviewInventory

          sortedInventory={sortedInventory}

          partenaireById={partenaireById}

          emptyState={emptyState}

        />

        <ClientPreviewTimeline

          timeline={timeline}

          loading={timelineLoading}

          lastSyncLabel={lastSyncLabel}

        />

      </ClientPreviewDeviceFrame>

    </div>

  );

}

