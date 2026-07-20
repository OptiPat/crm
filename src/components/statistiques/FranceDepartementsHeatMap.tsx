import { useMemo, useState } from "react";
import { Globe2 } from "lucide-react";
import {
  GEOGRAPHY_UNSET_KEY,
  isForeignCountryGeographyKey,
} from "@/lib/contacts/departement-from-code-postal";
import type { ContactGeographyStatRow } from "@/lib/statistiques/contact-geography-stats";
import {
  bubbleRadiusForCount,
  DOM_BUBBLE_MIN_HIT_RADIUS,
  FRANCE_DOM_DEPT_CODES,
  FRANCE_METRO_DEPARTMENT_PATHS,
  getDomEncartMapPoint,
  heatColorForCount,
  heatLegendPresenceColors,
  HEAT_MAP_EMPTY_COLOR,
  isDomDeptCode,
  isMetroDeptCode,
} from "@/lib/statistiques/france-departement-map-layout";
import { cn } from "@/lib/utils";

type FranceDepartementsHeatMapProps = {
  rows: ContactGeographyStatRow[];
  onSelectDept: (row: ContactGeographyStatRow) => void;
  className?: string;
  /** Libellé audience pour les pays étrangers (ex. Clients / Filleuls). */
  foreignAudienceLabel?: "Clients" | "Filleuls";
};

function ExtraGeographyChip({
  row,
  onSelect,
  maxCount,
}: {
  row: ContactGeographyStatRow;
  onSelect: (row: ContactGeographyStatRow) => void;
  maxCount: number;
}) {
  const interactive = row.count > 0;
  const swatchColor = heatColorForCount(row.count, maxCount);
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={() => interactive && onSelect(row)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-left text-xs transition-colors",
        interactive && "hover:bg-muted/40 cursor-pointer",
        !interactive && "opacity-60"
      )}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300/80"
        style={{ backgroundColor: swatchColor }}
        aria-hidden
      />
      <span className="font-medium text-foreground">{row.label}</span>
      <span className="text-muted-foreground tabular-nums">
        {row.count} · {row.percent.toFixed(0)} %
      </span>
    </button>
  );
}

export function FranceDepartementsHeatMap({
  rows,
  onSelectDept,
  className,
  foreignAudienceLabel = "Clients",
}: FranceDepartementsHeatMapProps) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  const rowByCode = useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);

  const metroRows = useMemo(
    () => rows.filter((row) => isMetroDeptCode(row.key)),
    [rows]
  );

  const domRows = useMemo(
    () => rows.filter((row) => isDomDeptCode(row.key)),
    [rows]
  );

  const foreignRows = useMemo(
    () => rows.filter((row) => isForeignCountryGeographyKey(row.key)),
    [rows]
  );

  const unsetRow = rowByCode.get(GEOGRAPHY_UNSET_KEY);

  const maxMetroCount = useMemo(
    () => Math.max(...metroRows.map((row) => row.count), 0),
    [metroRows]
  );

  const maxDomCount = useMemo(
    () => Math.max(...domRows.map((row) => row.count), 0),
    [domRows]
  );

  /** Échelle unique métropole + outre-mer pour des couleurs comparables. */
  const maxPresenceCount = useMemo(
    () => Math.max(maxMetroCount, maxDomCount, 1),
    [maxMetroCount, maxDomCount]
  );

  /** Zéro-contact en dessous ; petits volumes au-dessus pour limiter les bulles qui bloquent le clic. */
  const domCodesSorted = useMemo(() => {
    const countFor = (code: string) => rowByCode.get(code)?.count ?? 0;
    return [...FRANCE_DOM_DEPT_CODES].sort((a, b) => {
      const ca = countFor(a);
      const cb = countFor(b);
      if (ca === 0 && cb === 0) return 0;
      if (ca === 0) return -1;
      if (cb === 0) return 1;
      return ca - cb;
    });
  }, [rowByCode]);

  const legendColors = heatLegendPresenceColors(maxPresenceCount);

  const hoveredRow = hoveredCode ? rowByCode.get(hoveredCode) : null;
  const hoveredOnDom = hoveredRow != null && isDomDeptCode(hoveredRow.key);
  const hoveredOnMetro = hoveredRow != null && isMetroDeptCode(hoveredRow.key);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative rounded-xl border border-border/60 bg-[#f8fafc] dark:bg-muted/20 p-3 overflow-hidden">
        <svg
          viewBox="0 0 560 500"
          className="w-full h-auto max-h-[340px]"
          role="img"
          aria-label="Carte de France métropolitaine par département"
        >
          {FRANCE_METRO_DEPARTMENT_PATHS.map((feature) => {
            const row = rowByCode.get(feature.code);
            const count = row?.count ?? 0;
            const fill = heatColorForCount(count, maxPresenceCount);
            const isHovered = hoveredCode === feature.code;
            const interactive = count > 0;

            return (
              <path
                key={feature.code}
                d={feature.d}
                fill={fill}
                stroke={isHovered ? "#64748b" : "#cbd5e1"}
                strokeWidth={isHovered ? 1.4 : 0.6}
                className={cn(
                  "transition-colors duration-150",
                  interactive ? "cursor-pointer" : "pointer-events-none"
                )}
                onMouseEnter={() => setHoveredCode(feature.code)}
                onMouseLeave={() =>
                  setHoveredCode((prev) => (prev === feature.code ? null : prev))
                }
                onClick={() => row && count > 0 && onSelectDept(row)}
              />
            );
          })}
        </svg>

        {hoveredRow && hoveredOnMetro ? (
          <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-border/60 bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-sm pointer-events-none">
            <p className="font-medium text-foreground">{hoveredRow.label}</p>
            <p className="text-muted-foreground tabular-nums">
              {hoveredRow.count} contact{hoveredRow.count > 1 ? "s" : ""} ·{" "}
              {hoveredRow.percent.toFixed(1).replace(".0", "")} %
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/60 bg-[#f8fafc] dark:bg-muted/20 p-3 space-y-2">
        <div>
          <p className="text-xs font-medium text-foreground">France d&apos;outre-mer</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Même échelle que la métropole — vert, ambre, orange, rouge
          </p>
        </div>
        <div className="relative">
          <svg viewBox="0 0 200 115" className="w-full h-auto max-h-[130px]" aria-hidden>
            <rect
              x="1"
              y="1"
              width="198"
              height="113"
              rx="8"
              fill={HEAT_MAP_EMPTY_COLOR}
              stroke="#cbd5e1"
              strokeWidth="0.8"
            />
            {domCodesSorted.map((code) => {
              const point = getDomEncartMapPoint(code);
              if (!point) return null;
              const row = rowByCode.get(code);
              const count = row?.count ?? 0;
              const r = bubbleRadiusForCount(count, maxPresenceCount);
              const hitR = Math.max(r, DOM_BUBBLE_MIN_HIT_RADIUS);
              const fill = heatColorForCount(count, maxPresenceCount);
              const isHovered = hoveredCode === code;
              const interactive = count > 0 && row != null;
              return (
                <g key={code} className={interactive ? undefined : "pointer-events-none"}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={r}
                    fill={fill}
                    stroke={isHovered ? "#64748b" : "#cbd5e1"}
                    strokeWidth={isHovered ? 1.5 : 1}
                    className="pointer-events-none"
                  />
                  <text
                    x={point.x}
                    y={point.y + 3}
                    textAnchor="middle"
                    className="fill-slate-700 text-[7px] font-semibold pointer-events-none"
                  >
                    {code}
                  </text>
                  {interactive ? (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={hitR}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredCode(code)}
                      onMouseLeave={() =>
                        setHoveredCode((prev) => (prev === code ? null : prev))
                      }
                      onClick={() => onSelectDept(row)}
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>
          {hoveredRow && hoveredOnDom ? (
            <div className="absolute bottom-2 left-2 right-2 rounded-lg border border-border/60 bg-background/95 backdrop-blur px-2.5 py-1.5 text-xs shadow-sm pointer-events-none">
              <p className="font-medium text-foreground">{hoveredRow.label}</p>
              <p className="text-muted-foreground tabular-nums">
                {hoveredRow.count} contact{hoveredRow.count > 1 ? "s" : ""} ·{" "}
                {hoveredRow.percent.toFixed(1).replace(".0", "")} %
              </p>
            </div>
          ) : null}
        </div>
        {domRows.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {domRows.map((row) => (
              <ExtraGeographyChip
                key={row.key}
                row={row}
                onSelect={onSelectDept}
                maxCount={maxPresenceCount}
              />
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">Aucun contact en outre-mer.</p>
        )}
      </div>

      {foreignRows.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground inline-flex items-center gap-1.5">
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {foreignAudienceLabel} à l&apos;étranger
          </p>
          <div className="flex flex-wrap gap-2">
            {foreignRows.map((row) => (
              <ExtraGeographyChip
                key={row.key}
                row={row}
                onSelect={onSelectDept}
                maxCount={maxPresenceCount}
              />
            ))}
          </div>
        </div>
      ) : null}

      {unsetRow ? (
        <div className="flex flex-wrap gap-2">
          <ExtraGeographyChip
            row={unsetRow}
            onSelect={onSelectDept}
            maxCount={maxPresenceCount}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-muted-foreground pt-1">
        <span className="w-full text-[10px] text-muted-foreground/90 mb-0.5">
          Métropole et outre-mer — échelle commune
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm border border-slate-300"
            style={{ backgroundColor: HEAT_MAP_EMPTY_COLOR }}
          />
          Aucun
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm border border-slate-300"
            style={{ backgroundColor: legendColors.low }}
          />
          Faible
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm border border-slate-300"
            style={{ backgroundColor: legendColors.mid }}
          />
          Moyen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm border border-slate-300"
            style={{ backgroundColor: legendColors.high }}
          />
          Fort
        </span>
      </div>
    </div>
  );
}
