import { ChevronRight, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import type { DashboardStatContact } from "@/lib/api/tauri-dashboard";
import { resolveFilleulInvitationTimestamp } from "@/lib/organisation/organisation-filleul-dossier";
import { sortContactsAlphabetically } from "@/lib/contacts/contact-sort";
import { formatDashboardPercent } from "@/components/dashboard/dashboard-format";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import type {
  ContactSourceLeadInvestissementStatRow,
  ContactSourceLeadStatRow,
} from "@/lib/statistiques/contact-source-stats";
import type { StatistiquesPanelId } from "@/lib/statistiques/statistiques-page-preferences";
import { cn } from "@/lib/utils";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { Button } from "@/components/ui/button";
import { StatistiquesPanel } from "./statistiques-ui";

export type DistributionSortMode = "count" | "percent" | "label";

const MOBILE_ROW_LIMIT = 5;

function sortDistributionRows<
  T extends { key: string; label: string; count: number; percent: number },
>(rows: T[], mode: DistributionSortMode, getBarValue?: (row: T) => number): T[] {
  const copy = [...rows];
  if (mode === "label") {
    return copy.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }
  if (mode === "percent") {
    return copy.sort(
      (a, b) =>
        (getBarValue?.(b) ?? b.percent) - (getBarValue?.(a) ?? a.percent) ||
        a.label.localeCompare(b.label, "fr")
    );
  }
  return copy.sort(
    (a, b) =>
      (getBarValue?.(b) ?? b.count) - (getBarValue?.(a) ?? a.count) ||
      a.label.localeCompare(b.label, "fr")
  );
}

function DistributionSortBar({
  value,
  onChange,
}: {
  value: DistributionSortMode;
  onChange: (mode: DistributionSortMode) => void;
}) {
  const options: { id: DistributionSortMode; label: string }[] = [
    { id: "count", label: "Volume" },
    { id: "percent", label: "%" },
    { id: "label", label: "A → Z" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tri de la liste">
      <span className="text-xs text-muted-foreground mr-1">Tri :</span>
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant={value === option.id ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export type AttributionStatRow = ContactSourceLeadStatRow;
export type AttributionInvestissementStatRow = ContactSourceLeadInvestissementStatRow;

const ROW_COLORS = ["#10B981", "#3B82F6", "#C9A227", "#8B5CF6", "#F59E0B", "#06B6D4", "#EF4444"];

export function formatConversionSubtitle(row: AttributionInvestissementStatRow): string {
  const pct = row.conversionPercent.toFixed(1).replace(".0", "");
  return `${row.signedContactCount}/${row.contactCount} soit ${pct} % de taux de conversion`;
}

export function toDashboardStatContact(
  contact: Contact,
  dossiersByContactId?: Map<number, FilleulDossier>
): DashboardStatContact {
  const dossier = contact.id != null ? dossiersByContactId?.get(contact.id) : undefined;
  return {
    contact_id: contact.id,
    nom: contact.nom,
    prenom: contact.prenom,
    categorie: contact.categorie,
    filleul_categorie: contact.filleul_categorie,
    date_r1: contact.date_r1,
    date_invitation_filleul: resolveFilleulInvitationTimestamp(contact, dossier) ?? undefined,
  };
}

/** Liste drill-down statistiques — tri alphabétique nom, prénom. */
export function toDashboardStatContactList(
  contacts: Contact[],
  dossiersByContactId?: Map<number, FilleulDossier>
): DashboardStatContact[] {
  return sortContactsAlphabetically(contacts).map((contact) =>
    toDashboardStatContact(contact, dossiersByContactId)
  );
}

export function resolveInvestissementOpenContactId(
  inv: InvestissementWithDetails,
  contacts: Contact[]
): number | null {
  if (inv.contact_id != null) return inv.contact_id;
  if (inv.foyer_id == null) return null;
  const members = contacts
    .filter((c) => c.id != null && c.foyer_id === inv.foyer_id)
    .sort((a, b) => a.id! - b.id!);
  return members[0]?.id ?? null;
}

function AttributionDistributionRows<
  T extends { key: string; label: string; count: number; percent: number },
>({
  rows,
  total,
  icon: Icon,
  formatSubtitle,
  formatValue,
  getBarPercent,
  isInteractive: isInteractiveRow,
  onOpenRow,
  sortMode = "count",
  onSortModeChange,
}: {
  rows: T[];
  total: number;
  icon: LucideIcon;
  formatSubtitle: (row: T, total: number) => string;
  formatValue?: (row: T) => string;
  getBarPercent?: (row: T) => number;
  isInteractive?: (row: T) => boolean;
  onOpenRow: (row: T) => void;
  sortMode?: DistributionSortMode;
  onSortModeChange?: (mode: DistributionSortMode) => void;
}) {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const sortedRows = useMemo(
    () => sortDistributionRows(rows, sortMode, getBarPercent),
    [rows, sortMode, getBarPercent]
  );

  const barValues = sortedRows.map((row) => getBarPercent?.(row) ?? row.count);
  const max = Math.max(...barValues, 1);

  return (
    <div className="space-y-3">
      {onSortModeChange ? (
        <DistributionSortBar value={sortMode} onChange={onSortModeChange} />
      ) : null}

      <div className="space-y-2">
        {sortedRows.map((row, index) => {
          const color = ROW_COLORS[index % ROW_COLORS.length];
          const barValue = getBarPercent?.(row) ?? row.count;
          const widthPct = barValue > 0 ? Math.max(8, (barValue / max) * 100) : 0;
          const interactive = isInteractiveRow ? isInteractiveRow(row) : row.count > 0;

          return (
            <div
              key={row.key}
              className={cn(
                "rounded-lg border border-border/50 bg-background/80 px-3 py-2.5 space-y-2",
                interactive && "cursor-pointer hover:bg-muted/30 transition-colors",
                !interactive && "opacity-70",
                index >= MOBILE_ROW_LIMIT && !mobileExpanded && "hidden sm:block"
              )}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              onClick={interactive ? () => onOpenRow(row) : undefined}
              onKeyDown={
                interactive
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenRow(row);
                      }
                    }
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${color}18`, color }}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.label}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatSubtitle(row, total)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!interactive ? (
                    <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      Aucun
                    </span>
                  ) : null}
                  <span className="text-lg font-serif font-bold tabular-nums">
                    {formatValue ? formatValue(row) : row.count}
                  </span>
                  {interactive ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                  ) : null}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${widthPct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {sortedRows.length > MOBILE_ROW_LIMIT ? (
        <div className="sm:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setMobileExpanded((prev) => !prev)}
          >
            {mobileExpanded ? "Voir moins" : `Voir tout (${sortedRows.length})`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type AttributionDistributionPanelProps = {
  panelId: StatistiquesPanelId;
  title: string;
  description: string;
  loading: boolean;
  total: number;
  totalLabel: string;
  totalHint: string;
  rows: AttributionStatRow[];
  onOpenRow: (row: AttributionStatRow) => void;
  mapSlot?: React.ReactNode;
};

export function AttributionDistributionPanel({
  panelId,
  title,
  description,
  loading,
  total,
  totalLabel,
  totalHint,
  rows,
  onOpenRow,
  mapSlot,
}: AttributionDistributionPanelProps) {
  const [sortMode, setSortMode] = useState<DistributionSortMode>("count");

  return (
    <StatistiquesPanel title={title} description={description} collapsible panelId={panelId}>
      {loading ? (
        <ChartLoading />
      ) : total === 0 ? (
        <ChartEmpty title="Aucun contact éligible pour cette statistique." height={180} />
      ) : (
        <div className="space-y-4">
          {mapSlot}
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{totalLabel}</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {total}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">{totalHint}</p>
          </div>
          <AttributionDistributionRows
            rows={rows}
            total={total}
            icon={Users}
            formatSubtitle={(row, rowTotal) => formatDashboardPercent(row.count, rowTotal)}
            onOpenRow={onOpenRow}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
          />
        </div>
      )}
    </StatistiquesPanel>
  );
}

type AttributionConversionPanelProps = {
  panelId: StatistiquesPanelId;
  title: string;
  description: string;
  loading: boolean;
  rows: AttributionInvestissementStatRow[];
  variant: "client" | "filleul";
  summaryLabel: string;
  summaryValue: number;
  summaryHint: string;
  onOpenRow: (row: AttributionInvestissementStatRow) => void;
};

export function filterAttributionConversionVisibleRows(
  rows: AttributionInvestissementStatRow[],
  variant: "client" | "filleul"
): AttributionInvestissementStatRow[] {
  const isClient = variant === "client";
  return rows.filter(
    (row) => row.signedContactCount > 0 || (isClient && row.montantCentimes > 0)
  );
}

export function AttributionConversionPanel({
  panelId,
  title,
  description,
  loading,
  rows,
  variant,
  summaryLabel,
  summaryValue,
  summaryHint,
  onOpenRow,
}: AttributionConversionPanelProps) {
  const isClient = variant === "client";
  const [sortMode, setSortMode] = useState<DistributionSortMode>("count");

  const visibleRows = useMemo(
    () => filterAttributionConversionVisibleRows(rows, variant),
    [rows, variant]
  );

  return (
    <StatistiquesPanel title={title} description={description} collapsible panelId={panelId}>
      {loading ? (
        <ChartLoading />
      ) : visibleRows.length === 0 ? (
        <ChartEmpty title="Aucune conversion sur cette statistique." height={180} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{summaryLabel}</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {summaryValue}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">{summaryHint}</p>
          </div>
          <AttributionDistributionRows
            rows={visibleRows}
            total={rows.reduce((sum, row) => sum + row.contactCount, 0)}
            icon={TrendingUp}
            formatSubtitle={(row) => formatConversionSubtitle(row)}
            formatValue={
              isClient
                ? (row) => (row.montantCentimes > 0 ? formatEuroCentimes(row.montantCentimes) : "0 €")
                : (row) => `${row.conversionPercent.toFixed(0).replace(".0", "")} %`
            }
            getBarPercent={(row) => (isClient ? row.montantCentimes : row.conversionPercent)}
            isInteractive={(row) => row.contactCount > 0}
            onOpenRow={onOpenRow}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
          />
        </div>
      )}
    </StatistiquesPanel>
  );
}
