import { useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/StatCard";
import { CategoryPieChart } from "@/components/dashboard/CategoryPieChart";
import { ProductPieChart } from "@/components/dashboard/ProductPieChart";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { AlertsPreview } from "@/components/dashboard/AlertsPreview";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { DashboardSectionTitle } from "@/components/dashboard/dashboard-ui";
import { formatDashboardCurrency } from "@/components/dashboard/dashboard-ui";
import {
  Users,
  Home,
  TrendingUp,
  Bell,
  CalendarClock,
  ShoppingCart,
} from "lucide-react";
import { getDashboardStats, DashboardStats } from "@/lib/api/tauri-dashboard";
import { checkAndApplyAutoEtiquettes, seedDefaultEtiquettes } from "@/lib/api/tauri-etiquettes";
import { genererAlertesAutomatiques } from "@/lib/api/tauri-alertes";

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeAndLoadStats();
  }, []);

  const initializeAndLoadStats = async () => {
    try {
      setLoading(true);
      try {
        await seedDefaultEtiquettes();
      } catch {
        /* déjà initialisé */
      }
      try {
        await checkAndApplyAutoEtiquettes();
      } catch (error) {
        console.error("Erreur moteur étiquettes:", error);
      }
      try {
        await genererAlertesAutomatiques();
      } catch (error) {
        console.error("Erreur génération alertes:", error);
      }
      setStats(await getDashboardStats());
    } catch (error) {
      console.error("Erreur statistiques:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-[1600px]">
      <header className="border-b border-border/60 pb-6">
        <h2 className="text-3xl font-serif font-bold text-primary tracking-tight">
          Tableau de bord
        </h2>
        <p className="text-muted-foreground mt-1">
          Vue d&apos;ensemble de votre portefeuille et de votre activité
        </p>
      </header>

      <section className="space-y-4">
        <DashboardSectionTitle>Indicateurs clés</DashboardSectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full text-center py-10 text-sm text-muted-foreground">
              Chargement des indicateurs…
            </div>
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
              />
              <StatCard
                title="Encours placements"
                value={formatDashboardCurrency(stats.encours_placements)}
                description="AV, PER, FIP/FCPI…"
                icon={TrendingUp}
                accentColor="#C9A227"
                iconColor="text-amber-600"
                iconBgColor="bg-amber-50"
              />
              <StatCard
                title="Versements programmés"
                value={formatDashboardCurrency(stats.versements_programmes_annuels)}
                description="Montant annuel"
                icon={CalendarClock}
                accentColor="#3B82F6"
                iconColor="text-blue-600"
                iconBgColor="bg-blue-50"
              />
              <StatCard
                title="Biens immobiliers"
                value={stats.nombre_biens_immobiliers}
                description="Nombre de biens"
                icon={Home}
                accentColor="#059669"
                iconColor="text-emerald-600"
                iconBgColor="bg-emerald-50"
              />
              <StatCard
                title="Panier moyen"
                value={formatDashboardCurrency(stats.panier_moyen)}
                description="Investissement / client"
                icon={ShoppingCart}
                accentColor="#8B5CF6"
                iconColor="text-purple-600"
                iconBgColor="bg-purple-50"
              />
              <StatCard
                title="À recontacter"
                value={stats.alertes_non_traitees}
                description="Alertes actives"
                icon={Bell}
                accentColor="#EF4444"
                iconColor="text-red-600"
                iconBgColor="bg-red-50"
              />
            </>
          ) : (
            <div className="col-span-full text-center py-10 text-muted-foreground">
              Impossible de charger les statistiques
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <DashboardSectionTitle>Répartition</DashboardSectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <CategoryPieChart />
          <ProductPieChart />
        </div>
      </section>

      <section className="space-y-4">
        <DashboardSectionTitle>Activité & pipeline</DashboardSectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <MonthlyChart />
          <PipelineChart />
        </div>
      </section>

      <section className="space-y-4">
        <DashboardSectionTitle>À faire</DashboardSectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <AlertsPreview onNavigate={onNavigate} />
          <QuickActions onNavigate={onNavigate} />
        </div>
      </section>
    </div>
  );
}
