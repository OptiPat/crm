import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { getProductStats } from "@/lib/api/tauri-dashboard";
import {
  ChartEmpty,
  ChartLegendGrid,
  ChartLoading,
  ChartTooltipBox,
  formatDashboardCurrency,
  formatDashboardPercent,
} from "./dashboard-ui";

const COLORS: Record<string, string> = {
  IMMOBILIER: "#1E3A5F",
  PINEL: "#059669",
  DENORMANDIE: "#10B981",
  MALRAUX: "#047857",
  MONUMENT_HISTORIQUE: "#065F46",
  DEFICIT_FONCIER: "#34D399",
  LMNP: "#6EE7B7",
  LMP: "#A7F3D0",
  NUE_PROPRIETE: "#14B8A6",
  RESIDENCE_PRINCIPALE: "#0D9488",
  LOCATIF_CLASSIQUE: "#2DD4BF",
  SCPI: "#C9A227",
  SCPI_DEMEMBREMENT: "#B8860B",
  SCPI_FISCALE: "#D4A017",
  ASSURANCE_VIE: "#F43F5E",
  CONTRAT_CAPITALISATION: "#E11D48",
  PER: "#8B5CF6",
  EPARGNE_SALARIALE: "#A855F7",
  FIP_FCPI: "#3B82F6",
  FCPR: "#06B6D4",
  G3F: "#F59E0B",
  AUTRE: "#6B7280",
};

const LABELS: Record<string, string> = {
  IMMOBILIER: "Immobilier",
  PINEL: "Pinel",
  DENORMANDIE: "Denormandie",
  MALRAUX: "Malraux",
  MONUMENT_HISTORIQUE: "Monument historique",
  DEFICIT_FONCIER: "Déficit foncier",
  LMNP: "LMNP",
  LMP: "LMP",
  NUE_PROPRIETE: "Nue-propriété",
  RESIDENCE_PRINCIPALE: "Résidence principale",
  LOCATIF_CLASSIQUE: "Locatif classique",
  SCPI: "SCPI",
  SCPI_DEMEMBREMENT: "SCPI démembrement",
  SCPI_FISCALE: "SCPI fiscale",
  ASSURANCE_VIE: "Assurance-vie",
  CONTRAT_CAPITALISATION: "Capitalisation",
  PER: "PER",
  EPARGNE_SALARIALE: "Épargne salariale",
  FIP_FCPI: "FIP/FCPI",
  FCPR: "FCPR",
  G3F: "G3F",
  AUTRE: "Autres",
};

interface ChartData {
  name: string;
  value: number;
  color: string;
}

const MIN_SHARE = 0.025;
const MAX_BEFORE_GROUP = 6;

function buildChartData(stats: { type_produit: string; montant: number }[]): ChartData[] {
  const total = stats.reduce((s, x) => s + x.montant, 0);
  if (total <= 0) return [];

  const items = stats
    .filter((s) => s.montant > 0)
    .map((stat) => ({
      name: LABELS[stat.type_produit] || stat.type_produit,
      value: stat.montant,
      color: COLORS[stat.type_produit] || COLORS.AUTRE,
      share: stat.montant / total,
    }))
    .sort((a, b) => b.value - a.value);

  if (items.length <= MAX_BEFORE_GROUP) {
    return items.map(({ name, value, color }) => ({ name, value, color }));
  }

  const main: ChartData[] = [];
  let autres = 0;
  for (const item of items) {
    if (item.share < MIN_SHARE) autres += item.value;
    else main.push({ name: item.name, value: item.value, color: item.color });
  }
  if (autres > 0) {
    main.push({ name: LABELS.AUTRE, value: autres, color: COLORS.AUTRE });
  }
  return main.sort((a, b) => b.value - a.value);
}

export function ProductPieChart() {
  const [rawStats, setRawStats] = useState<{ type_produit: string; montant: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const data = useMemo(() => buildChartData(rawStats), [rawStats]);
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setRawStats(await getProductStats());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card className="shadow-sm border-border/80 h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-xl">Répartition par produit</CardTitle>
        <CardDescription>Encours par type de produit — survol pour le détail</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <ChartLoading height={360} />
        ) : data.length === 0 ? (
          <ChartEmpty
            height={360}
            title="Aucun investissement"
            subtitle="Ajoutez des investissements pour voir ce graphique"
          />
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={88}
                  paddingAngle={1}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={index} fill={entry.color} stroke="#fff" strokeWidth={1} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const v = payload[0].value as number;
                    return (
                      <ChartTooltipBox>
                        <p className="font-medium">{payload[0].name}</p>
                        <p className="text-primary font-semibold">{formatDashboardCurrency(v)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDashboardPercent(v, total)}
                        </p>
                      </ChartTooltipBox>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <ChartLegendGrid items={data} total={total} columns={2} maxHeight="9rem" />
            <p className="text-xs text-center text-muted-foreground tabular-nums">
              Total : {formatDashboardCurrency(total)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
