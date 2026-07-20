import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getAllInvestissements } from "@/lib/api/tauri-investissements";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import {
  CLIENT_PRODUCT_COVERAGE_CONFIGS,
  computeClientProductCoverageStats,
  filterContactsForClientProductCoverageList,
  formatClientProductCoveragePercent,
  formatClientProductCoverageSubtitle,
  type ClientProductCoverageConfig,
  type ClientProductCoverageListKind,
  type ClientProductCoverageStatResult,
} from "@/lib/statistiques/contact-client-product-coverage-stats";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { cn } from "@/lib/utils";
import { toDashboardStatContactList } from "./contact-stats-panels";
import { StatistiquesPanel } from "./statistiques-ui";

type ProductCoverageDrillDown = {
  config: ClientProductCoverageConfig;
  kind: ClientProductCoverageListKind;
};

function ProductCoverageListButton({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick: () => void;
}) {
  const interactive = count > 0;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={interactive ? onClick : undefined}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5 text-left",
        interactive && "hover:bg-muted/40 cursor-pointer transition-colors"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {count} client{count > 1 ? "s" : ""}
        </p>
      </div>
      {interactive ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </button>
  );
}

function ProductCoverageKpiPanel({
  config,
  stats,
  loading,
  onOpenList,
}: {
  config: ClientProductCoverageConfig;
  stats: ClientProductCoverageStatResult;
  loading: boolean;
  onOpenList: (kind: ClientProductCoverageListKind) => void;
}) {
  return (
    <StatistiquesPanel
      title={config.title}
      description={config.description}
      collapsible
      panelId={config.panelId}
    >
      {loading ? (
        <ChartLoading />
      ) : stats.totalCount === 0 ? (
        <ChartEmpty title="Aucun client actif éligible." height={180} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{config.kpiLabel}</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {formatClientProductCoveragePercent(stats.withProductPercent)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">
              {formatClientProductCoverageSubtitle(stats)}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">{config.hint}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <ProductCoverageListButton
              label={config.withLabel}
              count={stats.withProductCount}
              onClick={() => onOpenList("withProduct")}
            />
            <ProductCoverageListButton
              label={config.withoutLabel}
              count={stats.withoutProductContactIds.length}
              onClick={() => onOpenList("withoutProduct")}
            />
          </div>
        </div>
      )}
    </StatistiquesPanel>
  );
}

type ContactClientProductCoveragePanelsProps = {
  onNavigate?: (page: string) => void;
};

export function ContactClientProductCoveragePanels({
  onNavigate,
}: ContactClientProductCoveragePanelsProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<Awaited<ReturnType<typeof getAllInvestissements>>>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [drillDown, setDrillDown] = useState<ProductCoverageDrillDown | null>(null);

  const refreshData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [rows, invs] = await Promise.all([getAllContacts(), getAllInvestissements()]);
      setContacts(rows);
      setInvestissements(invs);
      setDataRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Erreur chargement stats produits clients:", error);
      setContacts([]);
      setInvestissements([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const {
    openContactWithTab,
    clearListBackMode,
    sheet: contactDetailSheet,
    isOpen: contactDetailOpen,
    activeContactId,
  } = useContactDetailSheet({
    onNavigate,
    onUpdate: () => void refreshData({ silent: true }),
  });

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(
    () => subscribeContactsChanged(() => void refreshData({ silent: true })),
    [refreshData]
  );

  useEffect(
    () => subscribeInvestissementsChanged(() => void refreshData({ silent: true })),
    [refreshData]
  );

  const statsByKind = useMemo(() => {
    const map = new Map<
      ClientProductCoverageConfig["kind"],
      ClientProductCoverageStatResult
    >();
    for (const config of CLIENT_PRODUCT_COVERAGE_CONFIGS) {
      map.set(config.kind, computeClientProductCoverageStats(contacts, investissements, config));
    }
    return map;
  }, [contacts, investissements]);

  const selectedStats = drillDown ? statsByKind.get(drillDown.config.kind) : undefined;

  const loadContactsSheet = useCallback(async () => {
    if (!drillDown) return [];
    return toDashboardStatContactList(
      filterContactsForClientProductCoverageList(
        contacts,
        drillDown.kind,
        investissements,
        drillDown.config
      )
    );
  }, [contacts, drillDown, investissements]);

  const openList = useCallback(
    (config: ClientProductCoverageConfig, kind: ClientProductCoverageListKind) => {
      setDrillDown({ config, kind });
      setContactsSheetOpen(true);
    },
    []
  );

  const sheetCount =
    drillDown?.kind === "withProduct"
      ? selectedStats?.withProductCount ?? 0
      : selectedStats?.withoutProductContactIds.length ?? 0;

  const sheetTitle =
    drillDown == null
      ? "Contacts"
      : drillDown.kind === "withProduct"
        ? drillDown.config.sheetWithTitle
        : drillDown.config.sheetWithoutTitle;

  return (
    <>
      {CLIENT_PRODUCT_COVERAGE_CONFIGS.map((config) => (
        <ProductCoverageKpiPanel
          key={config.kind}
          config={config}
          stats={statsByKind.get(config.kind)!}
          loading={loading}
          onOpenList={(kind) => openList(config, kind)}
        />
      ))}

      {contactsSheetOpen ? <DashboardDrillDownBackdrop /> : null}

      <DashboardStatContactsSheet
        open={contactsSheetOpen}
        onOpenChange={(open) => {
          if (!open && contactDetailOpen) return;
          setContactsSheetOpen(open);
          if (!open) {
            setDrillDown(null);
            clearListBackMode();
          }
        }}
        title={sheetTitle}
        description={
          drillDown && selectedStats && sheetCount > 0
            ? `${sheetCount} client${sheetCount > 1 ? "s" : ""} · ${formatClientProductCoveragePercent(selectedStats.withProductPercent)} ${drillDown.config.withLabel.toLowerCase()} au total`
            : undefined
        }
        loadContacts={loadContactsSheet}
        refreshSignal={dataRefreshKey}
        activeContactId={contactDetailOpen ? activeContactId : null}
        stackedContactOpen={contactDetailOpen}
        onOpenContact={(contactId) => {
          void openContactWithTab(contactId, undefined, { listBack: true });
        }}
      />

      {contactDetailSheet}
    </>
  );
}
