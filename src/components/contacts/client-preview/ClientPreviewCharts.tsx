import { useLayoutEffect, useRef, useState } from "react";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

import type { PatrimoineChartSlice } from "@/lib/patrimoine/patrimoine-charts";

import { distributeIntegerPercents } from "@/lib/patrimoine/chart-percents";

import { cn } from "@/lib/utils";

import { formatChartCenterTotal, formatShortEuro } from "./client-preview-format";

import { CP, CP_CHART_STROKE } from "./client-preview-theme";



const CHART_CENTER_MAX_REM = 1.125;

const CHART_CENTER_MIN_REM = 0.625;



function ChartCenterTotal({

  total,

  compact,

}: {

  total: number;

  compact?: boolean;

}) {

  const text = formatChartCenterTotal(total);

  const maxWidthPx = (compact ? 44 : 54) * 2 * 0.88;

  const ref = useRef<HTMLSpanElement>(null);

  const [fontSizeRem, setFontSizeRem] = useState(CHART_CENTER_MAX_REM);



  useLayoutEffect(() => {

    const el = ref.current;

    if (!el) return;



    let sizeRem = CHART_CENTER_MAX_REM;

    el.style.fontSize = `${sizeRem}rem`;



    while (sizeRem > CHART_CENTER_MIN_REM && el.scrollWidth > maxWidthPx) {

      sizeRem -= 0.0625;

      el.style.fontSize = `${sizeRem}rem`;

    }



    setFontSizeRem(sizeRem);

  }, [text, maxWidthPx]);



  return (

    <div

      className="flex max-w-full flex-col items-center justify-center text-center"

      style={{ width: maxWidthPx }}

    >

      <span className={CP.caption}>Total</span>

      <span

        ref={ref}

        className={`${CP.chartTotal} mt-0.5 whitespace-nowrap`}

        style={{ fontSize: `${fontSizeRem}rem` }}

      >

        {text}

      </span>

    </div>

  );

}



function DonutChart({

  data,

  total,

  compact,

}: {

  data: PatrimoineChartSlice[];

  total: number;

  compact?: boolean;

}) {

  if (data.length === 0 || total <= 0) {

    return (

      <div

        className={cn(

          `flex items-center justify-center ${CP.meta}`,

          compact ? "h-[150px]" : "h-[180px]"

        )}

      >

        Aucune donnée

      </div>

    );

  }



  return (

    <div className={cn("relative", compact ? "h-[150px]" : "h-[180px]")}>

      <ResponsiveContainer width="100%" height="100%">

        <PieChart>

          <Pie

            data={data}

            dataKey="value"

            nameKey="name"

            cx="50%"

            cy="50%"

            innerRadius={compact ? 44 : 54}

            outerRadius={compact ? 64 : 74}

            paddingAngle={2}

            strokeWidth={2}

            stroke={CP_CHART_STROKE}

          >

            {data.map((entry) => (

              <Cell key={entry.name} fill={entry.color} />

            ))}

          </Pie>

        </PieChart>

      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">

        <ChartCenterTotal total={total} compact={compact} />

      </div>

    </div>

  );

}



function ChartLegend({ data }: { data: PatrimoineChartSlice[] }) {
  const percents = distributeIntegerPercents(data.map((row) => row.value));

  return (
    <ul className="space-y-2.5">
      {data.map((row, index) => (
        <li
          key={row.name}
          className={`flex items-center justify-between gap-3 ${CP.body}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <span className={`${CP.meta} truncate`}>{row.name}</span>
          </div>
          <div className={`${CP.caption} flex shrink-0 items-baseline gap-2 tabular-nums`}>
            <span className="text-[var(--cp-ink-muted)]">{percents[index]} %</span>
            <span className={`${CP.amount} text-[var(--cp-ink-muted)]`}>
              {formatShortEuro(row.value)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}



function ChartPanel({

  title,

  data,

  compact,

}: {

  title: string;

  data: PatrimoineChartSlice[];

  compact?: boolean;

}) {

  const total = data.reduce((s, d) => s + d.value, 0);

  return (

    <div className={`${CP.card} p-4`}>

      <p className={CP.kicker}>{title}</p>

      <DonutChart data={data} total={total} compact={compact} />

      <div className="mt-4 border-t border-[var(--cp-line-soft)] pt-3">

        <ChartLegend data={data} />

      </div>

    </div>

  );

}



export interface ClientPreviewChartsProps {

  categorieData: PatrimoineChartSlice[];

  disponibiliteData: PatrimoineChartSlice[];

}



export function ClientPreviewCharts({

  categorieData,

  disponibiliteData,

}: ClientPreviewChartsProps) {

  return (

    <section className={`${CP.sectionGap} ${CP.padX}`}>

      <h3 className={CP.sectionTitle}>Répartition</h3>

      <div className="mt-4 grid grid-cols-1 gap-3 @min-[36rem]:grid-cols-2">

        <ChartPanel title="Par catégorie" data={categorieData} compact />

        <ChartPanel title="Par horizon" data={disponibiliteData} compact />

      </div>

    </section>

  );

}

