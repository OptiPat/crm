import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/StatCard";
import { CategoryPieChart } from "@/components/dashboard/CategoryPieChart";
import { ProductPieChart } from "@/components/dashboard/ProductPieChart";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { AlertsPreview } from "@/components/dashboard/AlertsPreview";
import { Users, Home, TrendingUp, Bell, CalendarClock, Building2, UserPlus, ShoppingCart } from "lucide-react";
import { getDashboardStats, DashboardStats } from "@/lib/api/tauri-dashboard";

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-serif font-bold text-primary mb-2">
          Tableau de bord
        </h2>
        <p className="text-muted-foreground">
          Vue d'ensemble de votre activité
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Chargement...
          </div>
        ) : stats ? (
          <>
            <StatCard
              title="Clients"
              value={stats.total_clients}
              description="Contacts actifs"
              icon={Users}
              iconColor="text-green-600"
              iconBgColor="bg-green-50"
            />
            <StatCard
              title="Encours placements"
              value={formatCurrency(stats.encours_placements)}
              description="AV, PER, FIP/FCPI..."
              icon={TrendingUp}
              iconColor="text-amber-600"
              iconBgColor="bg-amber-50"
            />
            <StatCard
              title="Versements programmés"
              value={formatCurrency(stats.versements_programmes_annuels)}
              description="Montant annuel"
              icon={CalendarClock}
              iconColor="text-blue-600"
              iconBgColor="bg-blue-50"
            />
            <StatCard
              title="Biens immobiliers"
              value={stats.nombre_biens_immobiliers}
              description="Nombre de biens"
              icon={Home}
              iconColor="text-emerald-600"
              iconBgColor="bg-emerald-50"
            />
            <StatCard
              title="Panier moyen"
              value={formatCurrency(stats.panier_moyen)}
              description="Investissement / client"
              icon={ShoppingCart}
              iconColor="text-purple-600"
              iconBgColor="bg-purple-50"
            />
            <StatCard
              title="À recontacter"
              value={stats.alertes_non_traitees}
              description="Alertes actives"
              icon={Bell}
              iconColor="text-red-600"
              iconBgColor="bg-red-50"
            />
          </>
        ) : (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            Erreur lors du chargement des statistiques
          </div>
        )}
      </div>

      {/* Graphiques - Ligne 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryPieChart />
        <ProductPieChart />
      </div>

      {/* Graphiques - Ligne 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MonthlyChart />
        <PipelineChart />
      </div>

      {/* Alertes et Actions rapides */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertsPreview />
        
        {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions rapides</CardTitle>
          <CardDescription>
            Commencez par ajouter vos premiers contacts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="p-4 border border-border rounded-lg hover:bg-accent transition-colors text-left">
              <Users className="h-6 w-6 mb-2 text-primary" />
              <div className="font-medium">Nouveau contact</div>
              <div className="text-sm text-muted-foreground">
                Ajouter un client ou prospect
              </div>
            </button>
            <button className="p-4 border border-border rounded-lg hover:bg-accent transition-colors text-left">
              <Building2 className="h-6 w-6 mb-2 text-primary" />
              <div className="font-medium">Nouveau foyer</div>
              <div className="text-sm text-muted-foreground">
                Créer un foyer fiscal
              </div>
            </button>
            <button className="p-4 border border-border rounded-lg hover:bg-accent transition-colors text-left">
              <UserPlus className="h-6 w-6 mb-2 text-primary" />
              <div className="font-medium">Nouveau partenaire</div>
              <div className="text-sm text-muted-foreground">
                Ajouter un collaborateur
              </div>
            </button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
