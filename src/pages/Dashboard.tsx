import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, UserPlus, TrendingUp } from "lucide-react";

export function Dashboard() {
  const stats = [
    {
      title: "Contacts",
      value: "0",
      description: "Clients et prospects",
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Foyers",
      value: "0",
      description: "Foyers fiscaux",
      icon: Building2,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Partenaires",
      value: "0",
      description: "Collaborateurs",
      icon: UserPlus,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "AUM Total",
      value: "0 €",
      description: "Assets Under Management",
      icon: TrendingUp,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
  ];

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
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
