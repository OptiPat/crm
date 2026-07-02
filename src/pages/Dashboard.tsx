import { useCallback, useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/dashboard/StatCard";
import { CategoryPieChart } from "@/components/dashboard/CategoryPieChart";
import { ProductPieChart } from "@/components/dashboard/ProductPieChart";
import { YearlyActivityChart } from "@/components/dashboard/YearlyActivityChart";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { ConversionFunnelPanel } from "@/components/dashboard/ConversionFunnelPanel";
import { DashboardPeriodFilterBar } from "@/components/dashboard/DashboardPeriodFilter";
import { AlertsPreview } from "@/components/dashboard/AlertsPreview";
import { DashboardTodayGrid } from "@/components/dashboard/DashboardTodayGrid";
import { QuickActions } from "@/components/dashboard/QuickActions";
import {
  DashboardPageHeader,
  DashboardSectionTitle,
  DashboardKpiHelp,
  DashboardCollapsibleSection,
  DashboardCockpitSection,
  StatCardSkeleton,
} from "@/components/dashboard/dashboard-ui";
import { formatDashboardCurrency } from "@/components/dashboard/dashboard-format";
import {
  Users,
  Home,
  TrendingUp,
  CalendarClock,
  ShoppingCart,
  Bell,
} from "lucide-react";
import { getDashboardStats, type DashboardStats } from "@/lib/api/tauri-dashboard";
import { seedDefaultEtiquettes } from "@/lib/api/tauri-etiquettes";
import { genererAlertesAutomatiques } from "@/lib/api/tauri-alertes";
import { subscribeAlertesChanged } from "@/lib/alertes/alert-events";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { subscribeEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
import {
  activityBucketGranularity,
  normalizeDateRange,
  resolveDashboardDateRange,
  type DashboardDateRangeFilter,
} from "@/lib/dashboard/dashboard-period-filter";
import {
  loadDashboardDateRange,
  saveDashboardDateRange,
} from "@/lib/dashboard/dashboard-date-range-preferences";

interface DashboardProps {
  currentPage?: string;
  onNavigate?: (page: string) => void;
  onOpenContact?: (contactId: number) => void;
}

export function Dashboard({ currentPage, onNavigate, onOpenContact }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [chartsRefreshKey, setChartsRefreshKey] = useState(0);
  const [dateRange, setDateRange] = useState<DashboardDateRangeFilter>(loadDashboardDateRange);
  const handleDateRangeChange = useCallback((next: DashboardDateRangeFilter) => {
    const normalized = normalizeDateRange(next);
    setDateRange(normalized);
    saveDashboardDateRange(normalized);
  }, []);
  const periodRange = useMemo(
    () => resolveDashboardDateRange(dateRange),
    [dateRange]
  );
  const activityBucket = useMemo(
    () => activityBucketGranularity(dateRange.from, dateRange.to),
    [dateRange]
  );

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (!silent) {
        try {
          await seedDefaultEtiquettes();
        } catch {
          /* déjà initialisé */
        }
        void genererAlertesAutomatiques().catch((error) => {
          console.error("Erreur génération alertes:", error);
        });
      }
      setStats(await getDashboardStats());
    } catch (error) {
      console.error("Erreur statistiques:", error);
      if (!silent) setStats(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    setChartsRefreshKey((k) => k + 1);
    void loadStats(true);
  }, [loadStats]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    const debounceRef = { id: null as number | null };
    const wakeDebounceRef = { id: null as number | null };
    const schedule = () => {
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
      debounceRef.id = window.setTimeout(() => {
        debounceRef.id = null;
        refreshAll();
      }, 120);
    };
    const unsubContacts = subscribeContactsChanged(schedule);
    const unsubInvestissements = subscribeInvestissementsChanged(schedule);
    const unsubAlertes = subscribeAlertesChanged(schedule);
    const unsubEtiquettes = subscribeEtiquettesChanged(schedule);
    const onWake = () => {
      if (document.hidden) return;
      if (wakeDebounceRef.id != null) window.clearTimeout(wakeDebounceRef.id);
      wakeDebounceRef.id = window.setTimeout(() => {
        wakeDebounceRef.id = null;
        refreshAll();
      }, 300);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      unsubContacts();
      unsubInvestissements();
      unsubAlertes();
      unsubEtiquettes();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
      if (wakeDebounceRef.id != null) window.clearTimeout(wakeDebounceRef.id);
    };
  }, [refreshAll]);

  const retryLoad = () => {
    setRefreshKey((k) => k + 1);
    void loadStats(false);
  };

  const openSuiviAlertes = onNavigate
    ? () => navigateToSuivi(onNavigate, "alertes", undefined, undefined, currentPage)
    : undefined;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-8">
      <div className="space-y-3">
        <DashboardPageHeader />

        <section className="space-y-3">
          <DashboardSectionTitle subtitle="Chiffres consolidés du portefeuille">
            Vue d&apos;ensemble
          </DashboardSectionTitle>
          <DashboardKpiHelp />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : stats ? (
            <>
              <StatCard
                title="Clients"
                value={stats.total_clients}
                description="Contacts actifs"
                icon={Users}
                accentColor="#10B981"
                iconColor="text-green-600"
                iconBgColor="bg-green-50"
                onClick={onNavigate ? () => onNavigate("contacts") : undefined}
              />
              <StatCard
                title="Encours placements"
                value={formatDashboardCurrency(stats.encours_placements)}
                description="AV, PER, FIP/FCPI… — avec moi"
                icon={TrendingUp}
                accentColor="#C9A227"
                iconColor="text-amber-600"
                iconBgColor="bg-amber-50"
                onClick={onNavigate ? () => onNavigate("investissements") : undefined}
              />
              <StatCard
                title="Alertes non traitées"
                value={stats.alertes_non_traitees}
                description="Relances à traiter"
                icon={Bell}
                accentColor="#EF4444"
                iconColor="text-red-600"
                iconBgColor="bg-red-50"
                highlight={stats.alertes_non_traitees > 0}
                onClick={openSuiviAlertes}
              />
              <StatCard
                title="Versements programmés"
                value={formatDashboardCurrency(stats.versements_programmes_annuels)}
                description="Montant annuel — avec moi"
                icon={CalendarClock}
                accentColor="#3B82F6"
                iconColor="text-blue-600"
                iconBgColor="bg-blue-50"
              />
              <StatCard
                title="Biens immobiliers"
                value={stats.nombre_biens_immobiliers}
                description="Nombre de biens — avec moi"
                icon={Home}
                accentColor="#059669"
                iconColor="text-emerald-600"
                iconBgColor="bg-emerald-50"
              />
              <StatCard
                title="Panier moyen"
                value={formatDashboardCurrency(stats.panier_moyen)}
                description="Montant souscrit / client (avec moi)"
                icon={ShoppingCart}
                accentColor="#8B5CF6"
                iconColor="text-purple-600"
                iconBgColor="bg-purple-50"
              />
            </>
          ) : (
            <div className="col-span-full rounded-xl border border-dashed py-12 text-center text-muted-foreground">
              Impossible de charger les statistiques.{" "}
              <button type="button" className="text-primary underline" onClick={retryLoad}>
                Réessayer
              </button>
            </div>
          )}
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <DashboardSectionTitle subtitle="Accès rapide aux pages principales">
          Raccourcis
        </DashboardSectionTitle>
        <QuickActions onNavigate={onNavigate} />
      </section>

      <DashboardCockpitSection>
        <DashboardTodayGrid
          key={`today-${refreshKey}`}
          currentPage={currentPage}
          onNavigate={onNavigate}
          onOpenContact={onOpenContact}
        />
        <AlertsPreview
          key={`alerts-${refreshKey}`}
          currentPage={currentPage}
          onNavigate={onNavigate}
          onOpenContact={onOpenContact}
        />
      </DashboardCockpitSection>

      <DashboardCollapsibleSection
        sectionId="repartition"
        title="Répartition"
        subtitle="Catégories et produits"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          <CategoryPieChart
            key={`cat-${chartsRefreshKey}`}
            onNavigate={onNavigate}
            currentPage={currentPage}
          />
          <ProductPieChart key={`prod-${chartsRefreshKey}`} />
        </div>
      </DashboardCollapsibleSection>

      <DashboardCollapsibleSection
        sectionId="activite"
        title="Activité"
        subtitle="Souscriptions et funnel commercial"
      >
        <DashboardPeriodFilterBar value={dateRange} onChange={handleDateRangeChange} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          <YearlyActivityChart
            key={`year-${chartsRefreshKey}`}
            periodStart={periodRange.start}
            periodEnd={periodRange.end}
            bucket={activityBucket}
          />
          <PipelineChart
            key={`pipe-${chartsRefreshKey}`}
            onNavigate={onNavigate}
            currentPage={currentPage}
          />
        </div>
        <ConversionFunnelPanel
          key={`conv-${chartsRefreshKey}`}
          periodStart={periodRange.start}
          periodEnd={periodRange.end}
          periodLabel={periodRange.label}
        />
      </DashboardCollapsibleSection>
    </div>
  );
}
