import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import {
  computeContactAgeStats,
  filterContactsForAgeLens,
  formatAgeStatsSubtitle,
  formatAverageAgeLabel,
  type AgeLens,
  type AgeListKind,
  type ContactAgeStatResult,
} from "@/lib/statistiques/contact-age-stats";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { cn } from "@/lib/utils";
import { toDashboardStatContactList } from "./contact-stats-panels";
import { StatistiquesPanel } from "./statistiques-ui";
import type { StatistiquesPanelId } from "@/lib/statistiques/statistiques-page-preferences";

type AgeDrillDown = {
  lens: AgeLens;
  kind: AgeListKind;
};

function AgeListButton({
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
          {count} contact{count > 1 ? "s" : ""}
        </p>
      </div>
      {interactive ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </button>
  );
}

type AgeKpiPanelProps = {
  panelId: StatistiquesPanelId;
  title: string;
  description: string;
  loading: boolean;
  stats: ContactAgeStatResult;
  hint: string;
  onOpenList: (kind: AgeListKind) => void;
};

function AgeKpiPanel({
  panelId,
  title,
  description,
  loading,
  stats,
  hint,
  onOpenList,
}: AgeKpiPanelProps) {
  return (
    <StatistiquesPanel title={title} description={description} collapsible panelId={panelId}>
      {loading ? (
        <ChartLoading />
      ) : stats.totalEligible === 0 ? (
        <ChartEmpty title="Aucun contact éligible pour cette statistique." height={180} />
      ) : (
        <div className="space-y-4">
          {stats.averageAge == null ? (
            <ChartEmpty title="Aucune date de naissance renseignée." height={120} />
          ) : (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Âge moyen</p>
                <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                  {formatAverageAgeLabel(stats.averageAge)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-right max-w-xs">
                {formatAgeStatsSubtitle(stats)}
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">{hint}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <AgeListButton
              label="Avec date de naissance"
              count={stats.countedCount}
              onClick={() => onOpenList("withBirthDate")}
            />
            <AgeListButton
              label="Sans date de naissance"
              count={stats.missingBirthDateCount}
              onClick={() => onOpenList("missingBirthDate")}
            />
          </div>
        </div>
      )}
    </StatistiquesPanel>
  );
}

type ContactAgePanelProps = {
  onNavigate?: (page: string) => void;
  /** Par défaut : clients + filleuls. */
  lens?: AgeLens | "both";
};

function ageSheetTitle(lens: AgeLens, kind: AgeListKind): string {
  const segment = lens === "client" ? "Clients" : "Filleuls";
  return kind === "withBirthDate"
    ? `${segment} — avec date de naissance`
    : `${segment} — sans date de naissance`;
}

export function ContactAgePanel({ onNavigate, lens = "both" }: ContactAgePanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [drillDown, setDrillDown] = useState<AgeDrillDown | null>(null);

  const refreshData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      setContacts(await getAllContacts());
      setDataRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Erreur chargement statistiques âge:", error);
      setContacts([]);
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

  const clientStats = useMemo(() => computeContactAgeStats(contacts, "client"), [contacts]);
  const filleulStats = useMemo(() => computeContactAgeStats(contacts, "filleul"), [contacts]);

  const selectedStats =
    drillDown?.lens === "filleul" ? filleulStats : clientStats;

  const loadContactsSheet = useCallback(async () => {
    if (!drillDown) return [];
    return toDashboardStatContactList(
      filterContactsForAgeLens(contacts, drillDown.lens, drillDown.kind)
    );
  }, [contacts, drillDown]);

  const openList = useCallback((lens: AgeLens, kind: AgeListKind) => {
    setDrillDown({ lens, kind });
    setContactsSheetOpen(true);
  }, []);

  const sheetCount =
    drillDown?.kind === "withBirthDate"
      ? selectedStats.countedCount
      : selectedStats.missingBirthDateCount;

  const agePanels = (
    <>
      {(lens === "both" || lens === "client") && (
        <AgeKpiPanel
          panelId="age_client"
          title={lens === "both" ? "Clients" : "Âge"}
          description="Âge moyen des clients actifs, anciens clients et prospects clients."
          loading={loading}
          stats={clientStats}
          hint="Suspects exclus — seuls les contacts avec date de naissance entrent dans la moyenne."
          onOpenList={(kind) => openList("client", kind)}
        />
      )}

      {(lens === "both" || lens === "filleul") && (
        <AgeKpiPanel
          panelId="age_filleul"
          title={lens === "filleul" ? "Âge" : "Filleuls"}
          description="Âge moyen des filleuls inscrits, prospects filleuls et filleuls désinscrits — tous parrains confondus."
          loading={loading}
          stats={filleulStats}
          hint="Suspects filleuls exclus — seuls les contacts avec date de naissance entrent dans la moyenne."
          onOpenList={(kind) => openList("filleul", kind)}
        />
      )}
    </>
  );

  return (
    <>
      {lens === "both" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">{agePanels}</div>
      ) : (
        agePanels
      )}

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
        title={drillDown ? ageSheetTitle(drillDown.lens, drillDown.kind) : "Contacts"}
        description={
          drillDown && sheetCount > 0
            ? drillDown.kind === "withBirthDate" && selectedStats.averageAge != null
              ? `${sheetCount} contact${sheetCount > 1 ? "s" : ""} · âge moyen ${formatAverageAgeLabel(selectedStats.averageAge)}`
              : `${sheetCount} contact${sheetCount > 1 ? "s" : ""}`
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
