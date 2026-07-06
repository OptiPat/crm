import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ComptaDepense,
  ComptaDeplacement,
  ComptaEncaissement,
} from "@/lib/api/tauri-compta";
import {
  computeComptaAnnualSummary,
  computeComptaExpensesByCategory,
  computeComptaMonthlyEvolution,
} from "@/lib/compta/compta-bilan";
import { formatComptaMoney } from "@/lib/compta/compta-money";
import { cn } from "@/lib/utils";

const COLORS = {
  ca: "#10B981",
  depenses: "#EF4444",
  ik: "#3B82F6",
  enc: "#10B981",
  dep: "#EF4444",
} as const;

const CATEGORY_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#F97316",
  "#EC4899",
  "#64748B",
];

interface ComptaBilanTabProps {
  year: number;
  month: number;
  depenses: ComptaDepense[];
  encaissements: ComptaEncaissement[];
  deplacements: ComptaDeplacement[];
  loading?: boolean;
}

function formatAxisMoney(value: number): string {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k €`;
  return `${Math.round(value)} €`;
}

export function ComptaBilanTab({
  year,
  month,
  depenses,
  encaissements,
  deplacements,
  loading = false,
}: ComptaBilanTabProps) {
  const annual = useMemo(
    () => computeComptaAnnualSummary(encaissements, depenses, deplacements, year),
    [encaissements, depenses, deplacements, year]
  );

  const monthly = useMemo(
    () => computeComptaMonthlyEvolution(encaissements, depenses, year, month),
    [encaissements, depenses, year, month]
  );

  const expenseSlices = useMemo(
    () => computeComptaExpensesByCategory(depenses),
    [depenses]
  );

  const annualChartData = useMemo(
    () => [
      { name: "CA HT", value: annual.caHT, fill: COLORS.ca },
      { name: "Dépenses HT", value: annual.depensesHT, fill: COLORS.depenses },
      { name: "Indemnités KM", value: annual.indemnitesKm, fill: COLORS.ik },
    ],
    [annual]
  );

  const monthlyChartData = useMemo(
    () =>
      monthly.map((point) => ({
        name: point.label,
        Encaissements: point.encaissementsTTC,
        Dépenses: point.depensesTTC,
      })),
    [monthly]
  );

  const pieData = useMemo(
    () =>
      expenseSlices.map((slice, index) => ({
        name: slice.categorie,
        value: slice.ttc,
        fill: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      })),
    [expenseSlices]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        Chargement du bilan…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Bilan annuel {year}</h2>
        <p className="text-sm text-muted-foreground">
          Synthèse HT et évolution TTC — calquée sur ComptaZen
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CA HT</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-emerald-600">{formatComptaMoney(annual.caHT)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dépenses HT</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-destructive">
              {formatComptaMoney(annual.depensesHT)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Indemnités km</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-blue-600">
              {formatComptaMoney(annual.indemnitesKm)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Résultat net</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-xl font-semibold",
                annual.resultatNet >= 0 ? "text-emerald-600" : "text-destructive"
              )}
            >
              {formatComptaMoney(annual.resultatNet)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <h3 className="mb-4 text-sm font-medium">Vue annuelle (HT)</h3>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={annualChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/50" />
              <XAxis type="number" tickFormatter={formatAxisMoney} />
              <YAxis type="category" dataKey="name" width={110} />
              <Tooltip
                formatter={(value) => formatComptaMoney(Number(value ?? 0))}
                contentStyle={{ borderRadius: 8 }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {annualChartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-medium">Évolution mensuelle (TTC)</h3>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData} margin={{ top: 8, right: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatAxisMoney} width={56} />
                <Tooltip
                  formatter={(value) => formatComptaMoney(Number(value ?? 0))}
                  contentStyle={{ borderRadius: 8 }}
                />
                <Legend />
                <Bar dataKey="Encaissements" fill={COLORS.enc} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Dépenses" fill={COLORS.dep} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-medium">Répartition des dépenses (TTC)</h3>
          {pieData.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
              Aucune dépense enregistrée
            </div>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={98}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatComptaMoney(Number(value ?? 0))}
                    contentStyle={{ borderRadius: 8 }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
