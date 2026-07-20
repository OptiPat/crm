import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { resolveOrganisationSelfContact } from "@/lib/organisation/organisation-tree";
import {
  computeFilleulAverageVolumeStats,
  computeFilleulClientBridgeStats,
  computeFilleulManagerStats,
  computeFilleulParraineurStats,
  filterContactsForFilleulBridgeList,
  filterContactsForFilleulOrganisationList,
  filterContactsForFilleulParraineurList,
  filterContactsForFilleulVolumeList,
  formatFilleulAverageVolumeSubtitle,
  formatFilleulBridgeSubtitle,
  formatFilleulManagerPercent,
  formatFilleulManagerSubtitle,
  formatFilleulParraineurSubtitle,
  type FilleulAverageVolumeStatResult,
  type FilleulBridgeListKind,
  type FilleulBridgeStatResult,
  type FilleulManagerStatResult,
  type FilleulOrganisationListKind,
  type FilleulParraineurListKind,
  type FilleulParraineurStatResult,
  type FilleulVolumeListKind,
} from "@/lib/statistiques/contact-filleul-organisation-stats";
import {
  computeFilleulAttritionStats,
  filterContactsForFilleulAttritionLens,
  type ContactAttritionStatResult,
} from "@/lib/statistiques/contact-attrition-stats";
import { formatDashboardPercent } from "@/components/dashboard/dashboard-format";
import { formatFilleulVolumeDisplay } from "@/lib/organisation/organisation-branch-volumes";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { cn } from "@/lib/utils";
import { toDashboardStatContactList } from "./contact-stats-panels";
import { AttritionKpiPanel } from "./contact-attrition-kpi-panel";
import { ContactAgePanel } from "./ContactAgePanel";
import { ContactGeographyPanel } from "./ContactGeographyPanel";
import { StatistiquesPanel } from "./statistiques-ui";

function OrganisationListButton({
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
          {count} filleul{count > 1 ? "s" : ""}
        </p>
      </div>
      {interactive ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </button>
  );
}

type OrganisationDrillDown =
  | { mode: "manager"; kind: FilleulOrganisationListKind }
  | { mode: "volume"; kind: FilleulVolumeListKind }
  | { mode: "parraineur"; kind: FilleulParraineurListKind }
  | { mode: "bridge"; kind: FilleulBridgeListKind }
  | { mode: "attrition"; kind: "active" | "attrited"; title: string; count: number };

function ManagerKpiPanel({
  loading,
  stats,
  onOpenList,
}: {
  loading: boolean;
  stats: FilleulManagerStatResult;
  onOpenList: (kind: FilleulOrganisationListKind) => void;
}) {
  return (
    <StatistiquesPanel
      title="Managers"
      description="Part des filleuls inscrits ayant un rang Manager dans l'organisation (titre Manager ou supérieur, ou qualification Planète et au-delà)."
      collapsible
      panelId="filleul_org_manager"
    >
      {loading ? (
        <ChartLoading />
      ) : stats.totalCount === 0 ? (
        <ChartEmpty title="Aucun filleul inscrit éligible pour cette statistique." height={180} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Managers</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {formatFilleulManagerPercent(stats.managerPercent)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">
              {formatFilleulManagerSubtitle(stats)}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Filleuls inscrits uniquement — désinscrits, prospects et suspects exclus. Tous parrains
            confondus.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <OrganisationListButton
              label="Managers"
              count={stats.managerCount}
              onClick={() => onOpenList("manager")}
            />
            <OrganisationListButton
              label="Autres filleuls inscrits"
              count={stats.otherContactIds.length}
              onClick={() => onOpenList("other")}
            />
          </div>
        </div>
      )}
    </StatistiquesPanel>
  );
}

function VolumeKpiPanel({
  loading,
  stats,
  onOpenList,
}: {
  loading: boolean;
  stats: FilleulAverageVolumeStatResult;
  onOpenList: (kind: FilleulVolumeListKind) => void;
}) {
  return (
    <StatistiquesPanel
      title="Volume moyen / consultant"
      description="Volume propre moyen de l'exercice en cours (champ « Volume propre » sur la fiche filleul)."
      collapsible
      panelId="filleul_org_volume"
    >
      {loading ? (
        <ChartLoading />
      ) : stats.totalEligible === 0 ? (
        <ChartEmpty title="Aucun filleul inscrit éligible pour cette statistique." height={180} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Volume moyen</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {formatFilleulVolumeDisplay(stats.averageVolume!)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">
              {formatFilleulAverageVolumeSubtitle(stats)}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Filleuls inscrits uniquement — tous parrains confondus. Volume non renseigné = 0 €.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <OrganisationListButton
              label="Avec volume exercice"
              count={stats.countedCount - stats.missingVolumeCount}
              onClick={() => onOpenList("withVolume")}
            />
            <OrganisationListButton
              label="Sans volume renseigné (0 €)"
              count={stats.missingVolumeCount}
              onClick={() => onOpenList("missingVolume")}
            />
          </div>
        </div>
      )}
    </StatistiquesPanel>
  );
}

function ParraineurKpiPanel({
  loading,
  stats,
  onOpenList,
}: {
  loading: boolean;
  stats: FilleulParraineurStatResult;
  onOpenList: (kind: FilleulParraineurListKind) => void;
}) {
  return (
    <StatistiquesPanel
      title="Parraineurs"
      description="Part des filleuls inscrits ayant parrainé au moins une personne dans le réseau filleul."
      collapsible
      panelId="filleul_org_parraineur"
    >
      {loading ? (
        <ChartLoading />
      ) : stats.totalCount === 0 ? (
        <ChartEmpty title="Aucun filleul inscrit éligible pour cette statistique." height={180} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Parraineurs</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {formatFilleulManagerPercent(stats.parraineurPercent)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">
              {formatFilleulParraineurSubtitle(stats)}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Filleuls inscrits uniquement — filleuls parrainés comptés même s&apos;ils sont
            désinscrits. Tous parrains confondus.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <OrganisationListButton
              label="Parraineurs"
              count={stats.parraineurCount}
              onClick={() => onOpenList("parraineur")}
            />
            <OrganisationListButton
              label="Sans filleul parrainé"
              count={stats.otherContactIds.length}
              onClick={() => onOpenList("other")}
            />
          </div>
        </div>
      )}
    </StatistiquesPanel>
  );
}

function BridgeKpiPanel({
  loading,
  stats,
  onOpenList,
}: {
  loading: boolean;
  stats: FilleulBridgeStatResult;
  onOpenList: (kind: FilleulBridgeListKind) => void;
}) {
  return (
    <StatistiquesPanel
      title="Client ↔ Filleul"
      description="Filleuls inscrits ou désinscrits de votre réseau direct ayant aussi un statut client ou prospect client."
      collapsible
      panelId="filleul_org_bridge"
    >
      {loading ? (
        <ChartLoading />
      ) : stats.totalCount === 0 ? (
        <ChartEmpty
          title="Aucun filleul direct éligible (parrain « Moi » requis)."
          height={180}
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Double rôle</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {formatFilleulManagerPercent(stats.bridgePercent)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">
              {formatFilleulBridgeSubtitle(stats)}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Réseau filleul + rôle client — vos filleuls directs inscrits ou désinscrits (vous = parrain).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <OrganisationListButton
              label="Avec statut client"
              count={stats.bridgeCount}
              onClick={() => onOpenList("bridge")}
            />
            <OrganisationListButton
              label="Filleuls seuls"
              count={stats.otherContactIds.length}
              onClick={() => onOpenList("other")}
            />
          </div>
        </div>
      )}
    </StatistiquesPanel>
  );
}

type ContactFilleulOrganisationPanelProps = {
  onNavigate?: (page: string) => void;
};

function drillDownTitle(drillDown: OrganisationDrillDown): string {
  if (drillDown.mode === "manager") {
    return drillDown.kind === "manager"
      ? "Filleuls Managers — inscrits"
      : "Filleuls inscrits — hors Manager";
  }
  if (drillDown.mode === "parraineur") {
    return drillDown.kind === "parraineur"
      ? "Filleuls inscrits — parraineurs"
      : "Filleuls inscrits — sans filleul parrainé";
  }
  if (drillDown.mode === "bridge") {
    return drillDown.kind === "bridge"
      ? "Filleuls directs — avec statut client"
      : "Filleuls directs — filleuls seuls";
  }
  if (drillDown.mode === "attrition") {
    return drillDown.title;
  }
  return drillDown.kind === "withVolume"
    ? "Filleuls inscrits — avec volume exercice renseigné"
    : "Filleuls inscrits — sans volume renseigné (0 €)";
}

export function ContactFilleulOrganisationPanel({
  onNavigate,
}: ContactFilleulOrganisationPanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selfContactId, setSelfContactId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [drillDown, setDrillDown] = useState<OrganisationDrillDown | null>(null);

  const refreshData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [rows, cgp] = await Promise.all([getAllContacts(), getCgpConfig()]);
      setContacts(rows);
      setSelfContactId(resolveOrganisationSelfContact(rows, cgp)?.id ?? null);
      setDataRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Erreur chargement statistiques organisation filleuls:", error);
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

  const statsOptions = useMemo(() => ({ selfContactId }), [selfContactId]);

  const managerStats = useMemo(() => computeFilleulManagerStats(contacts), [contacts]);
  const volumeStats = useMemo(() => computeFilleulAverageVolumeStats(contacts), [contacts]);
  const parraineurStats = useMemo(() => computeFilleulParraineurStats(contacts), [contacts]);
  const bridgeStats = useMemo(
    () => computeFilleulClientBridgeStats(contacts, statsOptions),
    [contacts, statsOptions]
  );
  const filleulAttritionStats = useMemo(() => computeFilleulAttritionStats(contacts), [contacts]);

  const loadContactsSheet = useCallback(async () => {
    if (!drillDown) return [];
    if (drillDown.mode === "manager") {
      return toDashboardStatContactList(
        filterContactsForFilleulOrganisationList(contacts, drillDown.kind)
      );
    }
    if (drillDown.mode === "parraineur") {
      return toDashboardStatContactList(
        filterContactsForFilleulParraineurList(contacts, drillDown.kind)
      );
    }
    if (drillDown.mode === "bridge") {
      return toDashboardStatContactList(
        filterContactsForFilleulBridgeList(contacts, drillDown.kind, statsOptions)
      );
    }
    if (drillDown.mode === "attrition") {
      return toDashboardStatContactList(
        filterContactsForFilleulAttritionLens(contacts, drillDown.kind)
      );
    }
    return toDashboardStatContactList(
      filterContactsForFilleulVolumeList(contacts, drillDown.kind)
    );
  }, [contacts, drillDown, statsOptions]);

  const openManagerList = useCallback((kind: FilleulOrganisationListKind) => {
    setDrillDown({ mode: "manager", kind });
    setContactsSheetOpen(true);
  }, []);

  const openVolumeList = useCallback((kind: FilleulVolumeListKind) => {
    setDrillDown({ mode: "volume", kind });
    setContactsSheetOpen(true);
  }, []);

  const openParraineurList = useCallback((kind: FilleulParraineurListKind) => {
    setDrillDown({ mode: "parraineur", kind });
    setContactsSheetOpen(true);
  }, []);

  const openBridgeList = useCallback((kind: FilleulBridgeListKind) => {
    setDrillDown({ mode: "bridge", kind });
    setContactsSheetOpen(true);
  }, []);

  const openFilleulAttritionList = useCallback(
    (kind: "active" | "attrited", stats: ContactAttritionStatResult) => {
      const count = kind === "active" ? stats.activeCount : stats.attritedCount;
      if (count === 0) return;
      const titles = { active: "Filleuls inscrits", attrited: "Filleuls désinscrits" };
      setDrillDown({ mode: "attrition", kind, title: titles[kind], count });
      setContactsSheetOpen(true);
    },
    []
  );

  const sheetCount = useMemo(() => {
    if (!drillDown) return 0;
    if (drillDown.mode === "manager") {
      return drillDown.kind === "manager"
        ? managerStats.managerCount
        : managerStats.otherContactIds.length;
    }
    if (drillDown.mode === "parraineur") {
      return drillDown.kind === "parraineur"
        ? parraineurStats.parraineurCount
        : parraineurStats.otherContactIds.length;
    }
    if (drillDown.mode === "bridge") {
      return drillDown.kind === "bridge"
        ? bridgeStats.bridgeCount
        : bridgeStats.otherContactIds.length;
    }
    if (drillDown.mode === "attrition") {
      return drillDown.count;
    }
    return drillDown.kind === "withVolume"
      ? volumeStats.countedCount - volumeStats.missingVolumeCount
      : volumeStats.missingVolumeCount;
  }, [drillDown, managerStats, parraineurStats, bridgeStats, volumeStats]);

  const sheetDescription = useMemo(() => {
    if (!drillDown || sheetCount === 0) return undefined;
    if (drillDown.mode === "manager") {
      return `${sheetCount} filleul${sheetCount > 1 ? "s" : ""} · ${formatFilleulManagerPercent(managerStats.managerPercent)} Managers au total`;
    }
    if (drillDown.mode === "parraineur") {
      return `${sheetCount} filleul${sheetCount > 1 ? "s" : ""} · ${formatFilleulManagerPercent(parraineurStats.parraineurPercent)} parraineurs au total`;
    }
    if (drillDown.mode === "bridge") {
      return `${sheetCount} filleul${sheetCount > 1 ? "s" : ""} · ${formatFilleulManagerPercent(bridgeStats.bridgePercent)} double rôle au total`;
    }
    if (drillDown.mode === "attrition") {
      return `${sheetCount} contact${sheetCount > 1 ? "s" : ""} — ${formatDashboardPercent(
        sheetCount,
        filleulAttritionStats.totalCount
      )}`;
    }
    if (drillDown.kind === "withVolume" && volumeStats.averageVolume != null) {
      return `${sheetCount} filleul${sheetCount > 1 ? "s" : ""} · volume moyen ${formatFilleulVolumeDisplay(volumeStats.averageVolume)}`;
    }
    return `${sheetCount} filleul${sheetCount > 1 ? "s" : ""}`;
  }, [drillDown, sheetCount, managerStats.managerPercent, parraineurStats.parraineurPercent, bridgeStats.bridgePercent, filleulAttritionStats.totalCount, volumeStats.averageVolume]);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <ContactGeographyPanel onNavigate={onNavigate} lens="filleul" />
        <ContactAgePanel onNavigate={onNavigate} lens="filleul" />
        <ManagerKpiPanel loading={loading} stats={managerStats} onOpenList={openManagerList} />
        <VolumeKpiPanel loading={loading} stats={volumeStats} onOpenList={openVolumeList} />
        <ParraineurKpiPanel
          loading={loading}
          stats={parraineurStats}
          onOpenList={openParraineurList}
        />
        <BridgeKpiPanel loading={loading} stats={bridgeStats} onOpenList={openBridgeList} />
        <div className="lg:col-span-2">
          <AttritionKpiPanel
            panelId="attrition_filleul"
            title="Attrition"
            description="Part des filleuls désinscrits parmi les filleuls ayant rejoint le réseau (inscrits + désinscrits)."
            loading={loading}
            stats={filleulAttritionStats}
            activeLabel="Filleuls inscrits"
            attritedLabel="Filleuls désinscrits"
            hint="Tous parrains confondus — prospects et suspects filleuls exclus."
            onOpenList={(kind) => openFilleulAttritionList(kind, filleulAttritionStats)}
          />
        </div>
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
        title={drillDown ? drillDownTitle(drillDown) : "Contacts"}
        description={sheetDescription}
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
