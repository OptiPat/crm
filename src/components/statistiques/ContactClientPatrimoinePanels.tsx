import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { DashboardStats } from "@/lib/api/tauri-dashboard";
import { formatDashboardCurrency } from "@/components/dashboard/dashboard-format";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import {
  DashboardStatInvestissementsSheet,
  type DashboardInvestissementsSheetVariant,
} from "@/components/dashboard/DashboardStatInvestissementsSheet";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { isContactEligibleForClientProductCoverageStats } from "@/lib/statistiques/contact-client-product-coverage-stats";
import { cn } from "@/lib/utils";
import type { StatistiquesPanelId } from "@/lib/statistiques/statistiques-page-preferences";
import { StatistiquesPanel } from "./statistiques-ui";
import { toDashboardStatContactList } from "./contact-stats-panels";
import { useStatistiquesPageData } from "./statistiques-page-data-context";

type PatrimoineKpiConfig = {
  panelId: StatistiquesPanelId;
  title: string;
  description: string;
  kpiLabel: string;
  hint: string;
  formatValue: (stats: DashboardStats) => string;
  formatSubtitle: (stats: DashboardStats) => string;
  isEmpty?: (stats: DashboardStats) => boolean;
  emptyTitle?: string;
  drillDown?: "placements" | "versements" | "clients";
};

const PATRIMOINE_KPIS: PatrimoineKpiConfig[] = [
  {
    panelId: "client_encours_placements",
    title: "Encours placements",
    description:
      "Valorisation actuelle des placements « avec moi » (AV, PER, épargne salariale, FIP/FCPI… — hors SCPI et immobilier).",
    kpiLabel: "Encours",
    hint: "Cliquez pour voir le détail des contrats — encours actif, pas les montants souscrits initiaux.",
    formatValue: (stats) => formatDashboardCurrency(stats.encours_placements),
    formatSubtitle: () => "Portefeuille placements « avec moi »",
    drillDown: "placements",
  },
  {
    panelId: "client_versements_programmes",
    title: "Versements programmés",
    description:
      "Projection annuelle des versements programmés actifs sur le portefeuille « avec moi ».",
    kpiLabel: "Versements / an",
    hint: "Cliquez pour lister les contrats avec VP actifs.",
    formatValue: (stats) => formatDashboardCurrency(stats.versements_programmes_annuels),
    formatSubtitle: () => "Montant annuel — avec moi",
    drillDown: "versements",
  },
  {
    panelId: "client_panier_moyen",
    title: "Panier moyen",
    description:
      "Montant souscrit par client actif « avec moi » (montant initial, pas l'encours actuel).",
    kpiLabel: "Panier moyen",
    hint: "Cliquez pour voir les clients actifs inclus dans le calcul.",
    formatValue: (stats) => formatDashboardCurrency(stats.panier_moyen),
    formatSubtitle: (stats) => {
      const label = stats.total_clients > 1 ? "clients actifs" : "client actif";
      return `${stats.total_clients} ${label} — placements « avec moi »`;
    },
    isEmpty: (stats) => stats.total_clients === 0,
    emptyTitle: "Aucun client actif éligible.",
    drillDown: "clients",
  },
];

function PatrimoineKpiPanel({
  config,
  stats,
  loading,
  onDrillDown,
}: {
  config: PatrimoineKpiConfig;
  stats: DashboardStats | null;
  loading: boolean;
  onDrillDown?: () => void;
}) {
  const interactive = Boolean(config.drillDown && stats && !config.isEmpty?.(stats));

  return (
    <StatistiquesPanel
      title={config.title}
      description={config.description}
      collapsible
      panelId={config.panelId}
    >
      {loading ? (
        <ChartLoading />
      ) : stats == null ? (
        <ChartEmpty title={`Impossible de charger ${config.title.toLowerCase()}.`} height={180} />
      ) : config.isEmpty?.(stats) ? (
        <ChartEmpty title={config.emptyTitle ?? "Aucune donnée éligible."} height={180} />
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
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{config.kpiLabel}</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {config.formatValue(stats)}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
              <p className="text-xs text-right max-w-xs">{config.formatSubtitle(stats)}</p>
              {interactive ? <ChevronRight className="h-4 w-4" aria-hidden /> : null}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{config.hint}</p>
        </button>
      )}
    </StatistiquesPanel>
  );
}

type ContactClientPatrimoinePanelsProps = {
  onNavigate?: (page: string) => void;
};

export function ContactClientPatrimoinePanels({ onNavigate }: ContactClientPatrimoinePanelsProps) {
  const { dashboard: stats, loading, contacts, dataRefreshKey, refreshData } =
    useStatistiquesPageData();
  const [investissementsSheet, setInvestissementsSheet] =
    useState<DashboardInvestissementsSheetVariant | null>(null);
  const [clientsSheetOpen, setClientsSheetOpen] = useState(false);

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

  const drillDownOpen = investissementsSheet != null || clientsSheetOpen;

  const loadActiveClients = async () => {
    return toDashboardStatContactList(
      contacts.filter((c) => isContactEligibleForClientProductCoverageStats(c))
    );
  };

  return (
    <>
      {PATRIMOINE_KPIS.map((config) => (
        <PatrimoineKpiPanel
          key={config.panelId}
          config={config}
          stats={stats}
          loading={loading}
          onDrillDown={() => {
            if (config.drillDown === "clients") {
              setInvestissementsSheet(null);
              setClientsSheetOpen(true);
              return;
            }
            if (config.drillDown === "placements" || config.drillDown === "versements") {
              setClientsSheetOpen(false);
              setInvestissementsSheet(config.drillDown);
            }
          }}
        />
      ))}

      {drillDownOpen ? <DashboardDrillDownBackdrop /> : null}

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

      <DashboardStatContactsSheet
        open={clientsSheetOpen}
        onOpenChange={(open) => {
          if (!open && contactDetailOpen) return;
          setClientsSheetOpen(open);
          if (!open) clearListBackMode();
        }}
        title="Clients actifs"
        description={
          stats
            ? `${stats.total_clients} client${stats.total_clients > 1 ? "s" : ""} — base du panier moyen`
            : undefined
        }
        loadContacts={loadActiveClients}
        refreshSignal={dataRefreshKey}
        activeContactId={contactDetailOpen ? activeContactId : null}
        stackedContactOpen={contactDetailOpen}
        onOpenContact={(contactId) => {
          void openContactWithTab(contactId, undefined, { listBack: true });
        }}
      />

      {contactDetailSheet}
    </>
  );
}
