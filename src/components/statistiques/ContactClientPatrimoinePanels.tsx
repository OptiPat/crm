import { useCallback, useEffect, useState } from "react";
import { getDashboardStats, type DashboardStats } from "@/lib/api/tauri-dashboard";
import { formatDashboardCurrency } from "@/components/dashboard/dashboard-format";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { StatistiquesPanel } from "./statistiques-ui";
import type { StatistiquesPanelId } from "@/lib/statistiques/statistiques-page-preferences";

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
};

const PATRIMOINE_KPIS: PatrimoineKpiConfig[] = [
  {
    panelId: "client_encours_placements",
    title: "Encours placements",
    description: "Valorisation actuelle des placements « avec moi » (AV, PER, FIP/FCPI… — hors SCPI et immobilier).",
    kpiLabel: "Encours",
    hint: "Encours actif des investissements financiers conseillés — pas les montants souscrits initiaux.",
    formatValue: (stats) => formatDashboardCurrency(stats.encours_placements),
    formatSubtitle: () => "Portefeuille placements « avec moi »",
  },
  {
    panelId: "client_versements_programmes",
    title: "Versements programmés",
    description: "Projection annuelle des versements programmés actifs sur le portefeuille « avec moi ».",
    kpiLabel: "Versements / an",
    hint: "Somme annualisée des VP actifs (mensuel ×12, trimestriel ×4, etc.).",
    formatValue: (stats) => formatDashboardCurrency(stats.versements_programmes_annuels),
    formatSubtitle: () => "Montant annuel — avec moi",
  },
  {
    panelId: "client_panier_moyen",
    title: "Panier moyen",
    description: "Montant souscrit par client actif « avec moi » (montant initial, pas l'encours actuel).",
    kpiLabel: "Panier moyen",
    hint: "Somme des montants initiaux souscrits « avec moi », divisée par le nombre de clients actifs (hors anciens clients).",
    formatValue: (stats) => formatDashboardCurrency(stats.panier_moyen),
    formatSubtitle: (stats) => {
      const label = stats.total_clients > 1 ? "clients actifs" : "client actif";
      return `${stats.total_clients} ${label} — placements « avec moi »`;
    },
    isEmpty: (stats) => stats.total_clients === 0,
    emptyTitle: "Aucun client actif éligible.",
  },
];

function PatrimoineKpiPanel({
  config,
  stats,
  loading,
}: {
  config: PatrimoineKpiConfig;
  stats: DashboardStats | null;
  loading: boolean;
}) {
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
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{config.kpiLabel}</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {config.formatValue(stats)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">
              {config.formatSubtitle(stats)}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">{config.hint}</p>
        </div>
      )}
    </StatistiquesPanel>
  );
}

export function ContactClientPatrimoinePanels() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      setStats(await getDashboardStats());
    } catch (error) {
      console.error("Erreur chargement stats patrimoine clients:", error);
      setStats(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(
    () =>
      subscribeContactsChanged(() => {
        void refreshData({ silent: true });
      }),
    [refreshData]
  );

  useEffect(
    () =>
      subscribeInvestissementsChanged(() => {
        void refreshData({ silent: true });
      }),
    [refreshData]
  );

  return (
    <>
      {PATRIMOINE_KPIS.map((config) => (
        <PatrimoineKpiPanel key={config.panelId} config={config} stats={stats} loading={loading} />
      ))}
    </>
  );
}
