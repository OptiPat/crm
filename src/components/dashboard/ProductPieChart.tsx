import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { getProductStats } from "@/lib/api/tauri-dashboard";

const COLORS: Record<string, string> = {
  IMMOBILIER: "#1E3A5F",        // Bleu profond
  SCPI: "#C9A227",              // Or
  SCPI_DEMEMBREMENT: "#B8860B", // Or foncé
  ASSURANCE_VIE: "#10B981",     // Vert
  FIP_FCPI: "#3B82F6",          // Bleu
  FCPR: "#06B6D4",              // Cyan
  PER: "#8B5CF6",               // Violet
  G3F: "#F59E0B",               // Ambre
  AUTRE: "#6B7280",             // Gris
};

const LABELS: Record<string, string> = {
  IMMOBILIER: "Immobilier",
  SCPI: "SCPI",
  SCPI_DEMEMBREMENT: "SCPI Démembrement",
  ASSURANCE_VIE: "Assurance-vie",
  FIP_FCPI: "FIP/FCPI",
  FCPR: "FCPR",
  PER: "PER",
  G3F: "G3F",
  AUTRE: "Autre",
};

interface ChartData {
  name: string;
  value: number;
  color: string;
}

export function ProductPieChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const stats = await getProductStats();
      
      const chartData = stats.map(stat => ({
        name: LABELS[stat.type_produit] || stat.type_produit,
        value: stat.montant,
        color: COLORS[stat.type_produit] || COLORS.AUTRE,
      }));
      
      setData(chartData);
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques produits:", error);
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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-border">
          <p className="font-medium">{payload[0].name}</p>
          <p className="text-sm text-primary font-semibold">
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Répartition par produit</CardTitle>
        <CardDescription>Distribution des investissements</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Chargement...
          </div>
        ) : data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="mb-2">Aucun investissement enregistré</p>
              <p className="text-sm">Ajoutez des investissements pour voir ce graphique</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
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
