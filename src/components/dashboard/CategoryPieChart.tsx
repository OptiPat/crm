import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { getCategoryStats } from "@/lib/api/tauri-dashboard";

const COLORS = {
  clients: "#10B981",           // Vert
  prospect_client: "#3B82F6",   // Bleu
  prospect_filleul: "#06B6D4",  // Cyan
  suspect_client: "#F59E0B",    // Ambre
  suspect_filleul: "#F97316",   // Orange
};

const LABELS = {
  clients: "Clients",
  prospect_client: "Prospects clients",
  prospect_filleul: "Prospects filleuls",
  suspect_client: "Suspects clients",
  suspect_filleul: "Suspects filleuls",
};

export function CategoryPieChart() {
  const [data, setData] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const stats = await getCategoryStats();
      
      const chartData = [
        { name: LABELS.clients, value: stats.clients, color: COLORS.clients },
        { name: LABELS.prospect_client, value: stats.prospect_client, color: COLORS.prospect_client },
        { name: LABELS.prospect_filleul, value: stats.prospect_filleul, color: COLORS.prospect_filleul },
        { name: LABELS.suspect_client, value: stats.suspect_client, color: COLORS.suspect_client },
        { name: LABELS.suspect_filleul, value: stats.suspect_filleul, color: COLORS.suspect_filleul },
      ].filter(item => item.value > 0); // Ne garder que les catégories avec des valeurs
      
      setData(chartData);
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques par catégorie:", error);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-border">
          <p className="font-medium">{payload[0].name}</p>
          <p className="text-sm text-muted-foreground">
            {payload[0].value} contact{payload[0].value > 1 ? 's' : ''}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Répartition par catégorie</CardTitle>
        <CardDescription>Distribution des contacts par type</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Chargement...
          </div>
        ) : data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Aucune donnée à afficher
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
