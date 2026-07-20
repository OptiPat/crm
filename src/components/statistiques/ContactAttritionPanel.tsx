import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import {
  computeClientAttritionStats,
  computeFilleulAttritionStats,
  filterContactsForClientAttritionLens,
  filterContactsForFilleulAttritionLens,
  type ContactAttritionStatResult,
} from "@/lib/statistiques/contact-attrition-stats";
import { formatDashboardPercent } from "@/components/dashboard/dashboard-format";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { cn } from "@/lib/utils";
import { toDashboardStatContact } from "./contact-stats-panels";
import { StatistiquesPanel } from "./statistiques-ui";
import type { StatistiquesPanelId } from "@/lib/statistiques/statistiques-page-preferences";

type AttritionLens = "client" | "filleul";

type AttritionDrillDown = {
  lens: AttritionLens;
  kind: "active" | "attrited";
  title: string;
  count: number;
};

function formatAttritionSubtitle(stats: ContactAttritionStatResult): string {
  const pct = stats.attritionPercent.toFixed(1).replace(".0", "");
  return `${stats.attritedCount}/${stats.totalCount} soit ${pct} % d'attrition`;
}

type AttritionKpiPanelProps = {
  panelId: StatistiquesPanelId;
  title: string;
  description: string;
  loading: boolean;
  stats: ContactAttritionStatResult;
  activeLabel: string;
  attritedLabel: string;
  hint: string;
  onOpenList: (kind: "active" | "attrited") => void;
};

function AttritionKpiPanel({
  panelId,
  title,
  description,
  loading,
  stats,
  activeLabel,
  attritedLabel,
  hint,
  onOpenList,
}: AttritionKpiPanelProps) {
  const pctLabel = stats.attritionPercent.toFixed(1).replace(".0", "");

  return (
    <StatistiquesPanel title={title} description={description} collapsible panelId={panelId}>
      {loading ? (
        <ChartLoading />
      ) : stats.totalCount === 0 ? (
        <ChartEmpty title="Aucun contact éligible pour cette statistique." height={180} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Attrition</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {pctLabel} %
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">{formatAttritionSubtitle(stats)}</p>
          </div>

          <p className="text-xs text-muted-foreground">{hint}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <AttritionListButton
              label={activeLabel}
              count={stats.activeCount}
              onClick={() => onOpenList("active")}
            />
            <AttritionListButton
              label={attritedLabel}
              count={stats.attritedCount}
              onClick={() => onOpenList("attrited")}
            />
          </div>
        </div>
      )}
    </StatistiquesPanel>
  );
}

function AttritionListButton({
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
        <p className="text-xs text-muted-foreground tabular-nums">{count} contact{count > 1 ? "s" : ""}</p>
      </div>
      {interactive ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </button>
  );
}

type ContactAttritionPanelProps = {
  onNavigate?: (page: string) => void;
};

export function ContactAttritionPanel({ onNavigate }: ContactAttritionPanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [drillDown, setDrillDown] = useState<AttritionDrillDown | null>(null);

  const refreshData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      setContacts(await getAllContacts());
      setDataRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Erreur chargement statistiques attrition:", error);
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

  const clientStats = useMemo(() => computeClientAttritionStats(contacts), [contacts]);
  const filleulStats = useMemo(() => computeFilleulAttritionStats(contacts), [contacts]);

  const loadContactsSheet = useCallback(async () => {
    if (!drillDown) return [];
    const filtered =
      drillDown.lens === "client"
        ? filterContactsForClientAttritionLens(contacts, drillDown.kind)
        : filterContactsForFilleulAttritionLens(contacts, drillDown.kind);
    return filtered.map(toDashboardStatContact);
  }, [contacts, drillDown]);

  const openList = useCallback(
    (lens: AttritionLens, kind: "active" | "attrited", stats: ContactAttritionStatResult) => {
      const count = kind === "active" ? stats.activeCount : stats.attritedCount;
      if (count === 0) return;

      const titles =
        lens === "client"
          ? { active: "Clients actifs", attrited: "Anciens clients" }
          : { active: "Filleuls inscrits", attrited: "Filleuls désinscrits" };

      setDrillDown({
        lens,
        kind,
        title: titles[kind],
        count,
      });
      setContactsSheetOpen(true);
    },
    []
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <AttritionKpiPanel
          panelId="attrition_client"
          title="Clients"
          description="Part des clients devenus anciens clients (statut EN_PAUSE) parmi les clients actifs et anciens."
          loading={loading}
          stats={clientStats}
          activeLabel="Clients actifs"
          attritedLabel="Anciens clients"
          hint="Base : catégorie Client uniquement — prospects et suspects clients exclus."
          onOpenList={(kind) => openList("client", kind, clientStats)}
        />

        <AttritionKpiPanel
          panelId="attrition_filleul"
          title="Filleuls"
          description="Part des filleuls désinscrits parmi les filleuls ayant rejoint le réseau (inscrits + désinscrits)."
          loading={loading}
          stats={filleulStats}
          activeLabel="Filleuls inscrits"
          attritedLabel="Filleuls désinscrits"
          hint="Tous parrains confondus — prospects et suspects filleuls exclus."
          onOpenList={(kind) => openList("filleul", kind, filleulStats)}
        />
      </div>

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
        title={drillDown?.title ?? "Contacts"}
        description={
          drillDown
            ? `${drillDown.count} contact${drillDown.count > 1 ? "s" : ""} — ${formatDashboardPercent(
                drillDown.count,
                drillDown.lens === "client" ? clientStats.totalCount : filleulStats.totalCount
              )}`
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
