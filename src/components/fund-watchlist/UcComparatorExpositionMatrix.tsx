import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CompareResponse, UcExposureSlice, UcFundExpositionSnapshot } from "@/lib/api/tauri-uc-comparator";
import { fundsInRankOrder } from "@/lib/fund-watchlist/uc-comparator-summary";
import {
  exposureHeatClass,
  MiniWeightBar,
  UC_TOP_HOLDINGS_DISPLAY,
} from "@/lib/fund-watchlist/uc-comparator-visual";
import { cn } from "@/lib/utils";

function collectLabels(snapshots: UcFundExpositionSnapshot[], key: "geo" | "sectors"): string[] {
  const labels = new Set<string>();
  for (const snap of snapshots) {
    for (const slice of snap[key]) {
      labels.add(slice.label);
    }
  }
  return Array.from(labels).sort((a, b) => a.localeCompare(b, "fr"));
}

function weightForLabel(
  snapshot: UcFundExpositionSnapshot,
  key: "geo" | "sectors",
  label: string
): number | null {
  const slice = snapshot[key].find((item) => item.label === label);
  return slice?.weight_percent ?? null;
}

function maxWeightInColumn(
  snapshots: UcFundExpositionSnapshot[],
  key: "geo" | "sectors",
  label: string
): number {
  return Math.max(
    0,
    ...snapshots.map((snap) => weightForLabel(snap, key, label) ?? 0)
  );
}

function formatWeight(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(1)} %`;
}

function topSlices(slices: UcExposureSlice[], limit = 5): UcExposureSlice[] {
  return [...slices].sort((a, b) => b.weight_percent - a.weight_percent).slice(0, limit);
}

type BreakdownTableProps = {
  title: string;
  snapshots: UcFundExpositionSnapshot[];
  funds: { isin: string; nom: string }[];
  keyName: "geo" | "sectors";
};

function BreakdownTable({ title, snapshots, funds, keyName }: BreakdownTableProps) {
  const labels = collectLabels(snapshots, keyName);
  if (labels.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{title}</h4>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="min-w-[140px]">Zone</TableHead>
              {funds.map((fund) => (
                <TableHead key={fund.isin} className="text-right min-w-[100px]">
                  {fund.nom.split(" ").slice(0, 2).join(" ")}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {labels.map((label) => {
              const max = maxWeightInColumn(snapshots, keyName, label);
              return (
                <TableRow key={label}>
                  <TableCell className="text-xs font-medium">{label}</TableCell>
                  {funds.map((fund) => {
                    const snap = snapshots.find((item) => item.isin === fund.isin);
                    const weight = snap ? weightForLabel(snap, keyName, label) : null;
                    return (
                      <TableCell
                        key={fund.isin}
                        className={cn(
                          "text-right text-xs tabular-nums",
                          exposureHeatClass(weight, max)
                        )}
                      >
                        {formatWeight(weight)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TopHoldingsTable({
  snapshots,
  funds,
}: {
  snapshots: UcFundExpositionSnapshot[];
  funds: { isin: string; nom: string }[];
}) {
  const hasHoldings = snapshots.some((snap) => (snap.holdings?.length ?? 0) > 0);
  if (!hasHoldings) return null;

  const rowIndexes = Array.from({ length: UC_TOP_HOLDINGS_DISPLAY }, (_, i) => i);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Principales lignes du portefeuille</h4>
      <p className="text-xs text-muted-foreground">
        6 premières positions Boursorama (composition) — lecture rapide des noms derrière le score.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-10">#</TableHead>
              {funds.map((fund) => (
                <TableHead key={fund.isin} className="min-w-[140px]">
                  {fund.nom.split(" ").slice(0, 2).join(" ")}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowIndexes.map((rowIndex) => (
              <TableRow key={rowIndex}>
                <TableCell className="text-xs text-muted-foreground tabular-nums">{rowIndex + 1}</TableCell>
                {funds.map((fund) => {
                  const holding = snapshots.find((s) => s.isin === fund.isin)?.holdings?.[rowIndex];
                  if (!holding) {
                    return (
                      <TableCell key={fund.isin} className="text-xs text-muted-foreground">
                        —
                      </TableCell>
                    );
                  }
                  const maxInFund = Math.max(
                    ...(snapshots.find((s) => s.isin === fund.isin)?.holdings?.map((h) => h.weight_percent) ?? [0])
                  );
                  return (
                    <TableCell key={fund.isin} className="text-xs align-top">
                      <div className="font-medium leading-snug">{holding.label}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="tabular-nums text-primary font-semibold shrink-0">
                          {holding.weight_percent.toFixed(1)} %
                        </span>
                        <MiniWeightBar weight={holding.weight_percent} maxWeight={maxInFund} />
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type Props = {
  response: CompareResponse;
  className?: string;
};

export function UcComparatorExpositionMatrix({ response, className }: Props) {
  const ranked = fundsInRankOrder(response.results ?? []);
  const snapshots = response.exposition ?? [];
  const hasAnyData = snapshots.some(
    (snap) =>
      snap.geo.length > 0 ||
      snap.sectors.length > 0 ||
      snap.style_box ||
      (snap.holdings?.length ?? 0) > 0
  );

  if (!hasAnyData) {
    return null;
  }

  const funds = ranked.map((fund) => ({ isin: fund.isin, nom: fund.nom }));
  const allComplete = snapshots.length > 0 && snapshots.every((snap) => snap.complete);

  return (
    <div className={cn("space-y-5", className)}>
      <div className="space-y-1 rounded-lg border border-violet-200/70 bg-violet-50/40 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/20">
        <h3 className="text-sm font-medium text-violet-950 dark:text-violet-100">
          Matrice d&apos;exposition
        </h3>
        <p className="text-xs text-muted-foreground">
          Lecture complémentaire hors score — lignes, géographie, secteurs et style Morningstar
          (Boursorama).
        </p>
        {!allComplete && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Données partielles pour au moins un fonds — relancez la comparaison pour rafraîchir le
            cache.
          </p>
        )}
      </div>

      <TopHoldingsTable snapshots={snapshots} funds={funds} />

      <BreakdownTable
        title="Zone géographique"
        snapshots={snapshots}
        funds={funds}
        keyName="geo"
      />

      <BreakdownTable
        title="Secteur d'activité"
        snapshots={snapshots}
        funds={funds}
        keyName="sectors"
      />

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Type d&apos;entreprise (Morningstar)</h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {funds.map((fund) => {
            const snap = snapshots.find((item) => item.isin === fund.isin);
            const styleBox = snap?.style_box;
            const topGeo = snap ? topSlices(snap.geo, 3) : [];
            const topSector = snap ? topSlices(snap.sectors, 3) : [];
            return (
              <div
                key={fund.isin}
                className="rounded-lg border border-indigo-200/60 bg-indigo-50/30 p-3 space-y-2 text-xs dark:border-indigo-900/40 dark:bg-indigo-950/20"
              >
                <p className="font-medium">{fund.nom.split(" ").slice(0, 2).join(" ")}</p>
                {styleBox ? (
                  <p className="text-indigo-800 dark:text-indigo-200 font-medium">{styleBox.label_fr}</p>
                ) : snap?.asset_breakdown && snap.asset_breakdown.length > 0 ? (
                  <div>
                    <p className="text-muted-foreground mb-1">Répartition actifs</p>
                    <ul className="space-y-0.5">
                      {topSlices(snap.asset_breakdown, 3).map((slice) => (
                        <li key={slice.label} className="flex justify-between gap-2">
                          <span className="truncate">{slice.label}</span>
                          <span className="tabular-nums shrink-0">
                            {slice.weight_percent.toFixed(1)} %
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Style Morningstar non publié par Boursorama pour ce fonds.
                  </p>
                )}
                {topGeo.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-1">Top zones</p>
                    <ul className="space-y-0.5">
                      {topGeo.map((slice) => (
                        <li key={slice.label} className="flex justify-between gap-2">
                          <span className="truncate">{slice.label}</span>
                          <span className="tabular-nums shrink-0 text-primary">
                            {slice.weight_percent.toFixed(1)} %
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {topSector.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-1">Top secteurs</p>
                    <ul className="space-y-0.5">
                      {topSector.map((slice) => (
                        <li key={slice.label} className="flex justify-between gap-2">
                          <span className="truncate">{slice.label}</span>
                          <span className="tabular-nums shrink-0 text-primary">
                            {slice.weight_percent.toFixed(1)} %
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
