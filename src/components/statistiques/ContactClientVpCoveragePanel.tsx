import { useCallback, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  computeClientVpCoverageStats,
  filterContactsForClientVpCoverageList,
  formatClientVpCoveragePercent,
  formatClientVpCoverageSubtitle,
  type ClientVpCoverageListKind,
} from "@/lib/statistiques/contact-client-vp-coverage-stats";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { cn } from "@/lib/utils";
import { toDashboardStatContactList } from "./contact-stats-panels";
import { StatistiquesPanel } from "./statistiques-ui";
import { useStatistiquesClientPatrimoineFetch } from "./statistiques-client-data-context";

function VpCoverageListButton({
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
        <p className="text-xs text-muted-foreground tabular-nums">{count} contrat{count > 1 ? "s" : ""}</p>
      </div>
      {interactive ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </button>
  );
}

type ContactClientVpCoveragePanelProps = {
  onNavigate?: (page: string) => void;
};

export function ContactClientVpCoveragePanel({ onNavigate }: ContactClientVpCoveragePanelProps) {
  const { contacts, investissements, loading, dataRefreshKey, refreshData } =
    useStatistiquesClientPatrimoineFetch();
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [listKind, setListKind] = useState<ClientVpCoverageListKind | null>(null);

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

  const stats = useMemo(
    () => computeClientVpCoverageStats(contacts, investissements),
    [contacts, investissements]
  );

  const withoutVpPercent =
    stats.totalCount > 0 ? (stats.withoutVpCount / stats.totalCount) * 100 : 0;

  const loadContactsSheet = useCallback(async () => {
    if (!listKind) return [];
    return toDashboardStatContactList(
      filterContactsForClientVpCoverageList(contacts, listKind, investissements)
    );
  }, [contacts, investissements, listKind]);

  const openList = useCallback((kind: ClientVpCoverageListKind) => {
    setListKind(kind);
    setContactsSheetOpen(true);
  }, []);

  const sheetContractCount = listKind === "withVp" ? stats.withVpCount : stats.withoutVpCount;

  const sheetTitle =
    listKind === "withVp"
      ? "Clients — AV/PER avec versement programmé"
      : listKind === "withoutVp"
        ? "Clients — AV/PER sans versement programmé"
        : "Contacts";

  return (
    <>
      <StatistiquesPanel
        title="Couverture VP"
        description="Part des contrats AV & PER « avec moi » avec versement programmé actif."
        collapsible
        panelId="client_vp_coverage"
      >
        {loading ? (
          <ChartLoading />
        ) : stats.totalCount === 0 ? (
          <ChartEmpty title="Aucun contrat AV/PER « avec moi »." height={180} />
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Avec VP</p>
                <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                  {formatClientVpCoveragePercent(stats.withVpPercent)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-right max-w-xs">
                {formatClientVpCoverageSubtitle(stats)}
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              AV & PER actifs « avec moi » uniquement — aligné onglet Patrimoine / Investissements.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <VpCoverageListButton
                label="Avec VP"
                count={stats.withVpCount}
                onClick={() => openList("withVp")}
              />
              <VpCoverageListButton
                label="Sans VP"
                count={stats.withoutVpCount}
                onClick={() => openList("withoutVp")}
              />
            </div>
          </div>
        )}
      </StatistiquesPanel>

      {contactsSheetOpen ? <DashboardDrillDownBackdrop /> : null}

      <DashboardStatContactsSheet
        open={contactsSheetOpen}
        onOpenChange={(open) => {
          if (!open && contactDetailOpen) return;
          setContactsSheetOpen(open);
          if (!open) {
            setListKind(null);
            clearListBackMode();
          }
        }}
        title={sheetTitle}
        description={
          listKind && sheetContractCount > 0
            ? listKind === "withVp"
              ? `${stats.withVpContactIds.length} client${stats.withVpContactIds.length > 1 ? "s" : ""} · ${formatClientVpCoveragePercent(stats.withVpPercent)} avec VP (${sheetContractCount} contrat${sheetContractCount > 1 ? "s" : ""})`
              : `${stats.withoutVpContactIds.length} client${stats.withoutVpContactIds.length > 1 ? "s" : ""} · ${formatClientVpCoveragePercent(withoutVpPercent)} sans VP (${sheetContractCount} contrat${sheetContractCount > 1 ? "s" : ""})`
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
