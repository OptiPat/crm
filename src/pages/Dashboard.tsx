import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/StatCard";
import { Users, Building2, UserPlus, TrendingUp, Bell } from "lucide-react";
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
              title="Prospects"
              value={stats.total_prospects}
              description="Clients potentiels"
              icon={UserPlus}
              iconColor="text-blue-600"
              iconBgColor="bg-blue-50"
            />
            <StatCard
              title="Suspects"
              value={stats.total_suspects}
              description="Leads à qualifier"
              icon={Building2}
              iconColor="text-orange-600"
              iconBgColor="bg-orange-50"
            />
            <StatCard
              title="Encours total"
              value={formatCurrency(stats.encours_total)}
              description="Assets Under Management"
              icon={TrendingUp}
              iconColor="text-amber-600"
              iconBgColor="bg-amber-50"
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

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Activité récente</CardTitle>
          <CardDescription>
            Vos dernières interactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Aucune activité récente
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
