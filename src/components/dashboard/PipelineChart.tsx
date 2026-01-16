import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { getPipelineStats } from "@/lib/api/tauri-dashboard";

const COLORS = {
  suspects: "#F59E0B",   // Ambre/Orange
  prospects: "#3B82F6",  // Bleu
  clients: "#10B981",    // Vert
};

interface ChartData {
  stage: string;
  count: number;
  color: string;
}

export function PipelineChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const stats = await getPipelineStats();
      
      const chartData: ChartData[] = [
        { stage: "Suspects", count: stats.suspects, color: COLORS.suspects },
        { stage: "Prospects", count: stats.prospects, color: COLORS.prospects },
        { stage: "Clients", count: stats.clients, color: COLORS.clients },
      ];
      
      setData(chartData);
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques pipeline:", error);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const total = data.reduce((sum, item) => sum + item.count, 0);
      const percentage = total > 0 ? ((payload[0].value / total) * 100).toFixed(1) : 0;
      
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-border">
          <p className="font-medium">{payload[0].payload.stage}</p>
          <p className="text-sm text-primary font-semibold">
            {payload[0].value} contact{payload[0].value > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            {percentage}% du total
          </p>
        </div>
      );
    }
    return null;
  };

  const total = data.reduce((sum, item) => sum + item.count, 0);
  const conversionRate = total > 0 && data[2] ? ((data[2].count / total) * 100).toFixed(1) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Pipeline commercial</CardTitle>
        <CardDescription>
          Funnel de conversion • Taux de conversion: {conversionRate}%
        </CardDescription>
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
            <BarChart 
              data={data} 
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis 
                type="category" 
                dataKey="stage" 
                stroke="#6b7280" 
                style={{ fontSize: '12px' }}
                width={100}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
