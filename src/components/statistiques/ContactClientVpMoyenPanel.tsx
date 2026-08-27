import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatDashboardCurrency } from "@/components/dashboard/dashboard-format";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import {
  DashboardStatInvestissementsSheet,
  type DashboardInvestissementsSheetVariant,
} from "@/components/dashboard/DashboardStatInvestissementsSheet";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import {
  computeClientVpMoyenMensuelStats,
  type ClientVpMoyenBucketStats,
} from "@/lib/statistiques/contact-client-vp-moyen-stats";
import type { StatistiquesPanelId } from "@/lib/statistiques/statistiques-page-preferences";
import { cn } from "@/lib/utils";
import { StatistiquesPanel } from "./statistiques-ui";
import { useStatistiquesPageData } from "./statistiques-page-data-context";

const FREQ_HINT =
  "Trimestre, semestre et annuel sont ramenés au mois ; fréquence non renseignée = mensuel.";

type VpMoyenFamilyConfig = {
  panelId: StatistiquesPanelId;
  title: string;
  description: string;
  emptyTitle: string;
  hint: string;
  sheetVariant: Extract<DashboardInvestissementsSheetVariant, "versements_av_per" | "versements_scpi">;
  productLabel: string;
};

const VP_MOYEN_FAMILIES: VpMoyenFamilyConfig[] = [
  {
    panelId: "client_vp_moyen",
    title: "VP moyen AV / PER",
    description: `Moyenne mensuelle des versements programmés actifs sur les contrats AV et PER « avec moi ». ${FREQ_HINT}`,
    emptyTitle: "Aucun VP AV / PER « avec moi ».",
    hint: "Cliquez pour lister les contrats AV et PER avec VP actif.",
    sheetVariant: "versements_av_per",
    productLabel: "AV / PER",
  },
  {
    panelId: "client_vp_moyen_scpi",
    title: "VP moyen SCPI",
    description: `Moyenne mensuelle des versements programmés actifs sur les SCPI « avec moi ». ${FREQ_HINT}`,
    emptyTitle: "Aucun VP SCPI « avec moi ».",
    hint: "Cliquez pour lister les SCPI avec VP actif.",
    sheetVariant: "versements_scpi",
    productLabel: "SCPI",
  },
];

function VpMoyenFamilyPanel({
  config,
  bucket,
  loading,
  onDrillDown,
}: {
  config: VpMoyenFamilyConfig;
  bucket: ClientVpMoyenBucketStats;
  loading: boolean;
  onDrillDown: () => void;
}) {
  const interactive = bucket.moyenMensuelEuros != null && bucket.count > 0;

  return (
    <StatistiquesPanel
      title={config.title}
      description={config.description}
      collapsible
      panelId={config.panelId}
    >
      {loading ? (
        <ChartLoading />
      ) : bucket.moyenMensuelEuros == null ? (
        <ChartEmpty title={config.emptyTitle} height={180} />
      ) : (
        <button
          type="button"
          disabled={!interactive}
          onClick={interactive ? onDrillDown : undefined}
          className={cn(
            "w-full text-left space-y-4 rounded-lg transition-colors",
            interactive && "cursor-pointer hover:bg-muted/30 -m-2 p-2"
          )}
        >
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">VP moyen / mois</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {formatDashboardCurrency(bucket.moyenMensuelEuros)}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
              <p className="text-xs text-right max-w-xs">
                {bucket.count} VP — {config.productLabel}
              </p>
              {interactive ? <ChevronRight className="h-4 w-4" aria-hidden /> : null}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{config.hint}</p>
        </button>
      )}
    </StatistiquesPanel>
  );
}

type ContactClientVpMoyenPanelsProps = {
  onNavigate?: (page: string) => void;
};

export function ContactClientVpMoyenPanels({ onNavigate }: ContactClientVpMoyenPanelsProps) {
  const { loading, investissementsWithDetails, dataRefreshKey, refreshData } =
    useStatistiquesPageData();
  const [investissementsSheet, setInvestissementsSheet] =
    useState<DashboardInvestissementsSheetVariant | null>(null);

  const stats = useMemo(
    () => computeClientVpMoyenMensuelStats(investissementsWithDetails),
    [investissementsWithDetails]
  );

  const {
    openContactWithTab,
    clearListBackMode,
    sheet: contactDetailSheet,
    isOpen: contactDetailOpen,
    activeContactId,
  } = useContactDetailSheet({
    onNavigate,
    onUpdate: () => void refreshData({ silent: true }),
  });

  return (
    <>
      {VP_MOYEN_FAMILIES.map((config) => (
        <VpMoyenFamilyPanel
          key={config.panelId}
          config={config}
          bucket={config.sheetVariant === "versements_av_per" ? stats.avPer : stats.scpi}
          loading={loading}
          onDrillDown={() => setInvestissementsSheet(config.sheetVariant)}
        />
      ))}

      {investissementsSheet != null ? <DashboardDrillDownBackdrop /> : null}

      <DashboardStatInvestissementsSheet
        variant={investissementsSheet}
        open={investissementsSheet != null}
        stackedContactOpen={contactDetailOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (contactDetailOpen) return;
            setInvestissementsSheet(null);
            clearListBackMode();
          }
        }}
        onOpenContact={(contactId) => {
          void openContactWithTab(contactId, "patrimoine", { listBack: true });
        }}
        activeContactId={contactDetailOpen ? activeContactId : null}
        refreshSignal={dataRefreshKey}
      />

      {contactDetailSheet}
    </>
  );
}
