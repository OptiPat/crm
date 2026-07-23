import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  computeFilleulAverageVolumeExerciceStats,
  computeFilleulClientBridgeStats,
  computeFilleulManagerStats,
  computeFilleulParraineurStats,
  computeFilleulParraineurExerciceStats,
  filterContactsForFilleulBridgeList,
  filterContactsForFilleulOrganisationList,
  filterContactsForFilleulParraineurExerciceList,
  filterContactsForFilleulVolumeExerciceList,
  formatFilleulParraineurCumulativeIndex,
  formatFilleulParraineurExerciceSubtitle,
  formatFilleulAverageVolumeExerciceSubtitle,
  formatFilleulBridgeSubtitle,
  formatFilleulManagerPercent,
  formatFilleulManagerSubtitle,
  isFilleulParrainableDownline,
  isContactEligibleForFilleulParraineurStats,
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
  computeFilleulAttritionExerciceStats,
  filterContactsForFilleulAttritionExerciceLens,
  formatFilleulAttritionCumulativeIndex,
  formatFilleulAttritionExerciceSubtitle,
  type ContactAttritionStatResult,
} from "@/lib/statistiques/contact-attrition-stats";
import { formatDashboardPercent } from "@/components/dashboard/dashboard-format";
import { formatFilleulVolumeDisplay } from "@/lib/organisation/organisation-branch-volumes";
import {
  filleulVolumeBenchmarkStatusBoxClasses,
  filleulVolumeBenchmarkStatusLabel,
  filleulVolumeBenchmarkStatusValueClasses,
  formatSponsorRateVsGroupBenchmarkPercent,
  formatVolumeVsGroupBenchmarkPercent,
  getFilleulSponsorRateBenchmarkStatus,
  getFilleulVolumeBenchmarkStatus,
} from "@/lib/statistiques/statistiques-benchmark-settings";
import { useStatistiquesBenchmarkSettings } from "@/hooks/useStatistiquesBenchmarkSettings";
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
import { useStatistiquesPageData } from "./statistiques-page-data-context";
import {
  OrganisationExerciceSelector,
  ORGANISATION_CURRENT_EXERCICE,
} from "@/components/organisation/OrganisationExerciceSelector";
import {
  applyExerciceVolumesToContacts,
  indexFilleulVolumeExercicesByContactId,
  isCurrentOrganisationExercice,
  resolveOrganisationExerciceLabel,
  type OrganisationExerciceSelection,
} from "@/lib/organisation/organisation-volume-history";
import { indexFilleulDossiersByContactId } from "@/lib/organisation/organisation-filleul-dossier";
import { collectOrganisationDossierContactIds } from "@/lib/organisation/organisation-tree";
import { getFilleulDossiersByContactIds, type FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import {
  getFilleulVolumeExercicesByLabel,
  listFilleulVolumeExerciceLabels,
} from "@/lib/api/tauri-filleul-volumes";
import { currentFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";

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
  | { mode: "attrition"; kind: "active" | "attrited"; count: number };

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
  exerciceLabel,
  stats,
  onOpenList,
}: {
  loading: boolean;
  exerciceLabel: string;
  stats: FilleulAverageVolumeStatResult;
  onOpenList: (kind: FilleulVolumeListKind) => void;
}) {
  const benchmarkSettings = useStatistiquesBenchmarkSettings();
  const benchmarkStatus =
    stats.averageVolume != null
      ? getFilleulVolumeBenchmarkStatus(stats.averageVolume, benchmarkSettings)
      : null;

  return (
    <StatistiquesPanel
      title="Volume moyen / consultant actif"
      description={`Volume propre moyen sur l'exercice ${exerciceLabel}, calculé sur les consultants présents sur la période (inscrits ou désinscrits selon dates dossier) ayant au moins 1 € de volume propre.`}
      collapsible
      panelId="filleul_org_volume"
    >
      {loading ? (
        <ChartLoading />
      ) : stats.totalEligible === 0 ? (
        <ChartEmpty title="Aucun consultant présent sur cet exercice." height={180} />
      ) : stats.averageVolume == null ? (
        <ChartEmpty
          title="Aucun consultant actif (volume propre inférieur à 1 € sur l'exercice)."
          height={180}
        />
      ) : (
        <div className="space-y-4">
          <div
            className={cn(
              "rounded-xl border px-4 py-3 flex items-center justify-between gap-4 transition-colors",
              benchmarkStatus
                ? filleulVolumeBenchmarkStatusBoxClasses(benchmarkStatus)
                : "border-border/60 bg-muted/20"
            )}
            title={benchmarkStatus ? filleulVolumeBenchmarkStatusLabel(benchmarkStatus) : undefined}
          >
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Exercice {exerciceLabel}
              </p>
              <p
                className={cn(
                  "text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5",
                  benchmarkStatus
                    ? filleulVolumeBenchmarkStatusValueClasses(benchmarkStatus)
                    : "text-primary"
                )}
              >
                {formatFilleulVolumeDisplay(stats.averageVolume)}
              </p>
            </div>
            <div className="text-xs text-muted-foreground text-right max-w-xs space-y-0.5">
              <p>{formatFilleulAverageVolumeExerciceSubtitle(stats, exerciceLabel)}</p>
              <p className="tabular-nums">
                Réf. groupe {formatFilleulVolumeDisplay(benchmarkSettings.groupActiveConsultantVolumeEuros)}
              </p>
              <p className="font-medium text-foreground tabular-nums">
                {formatVolumeVsGroupBenchmarkPercent(stats.averageVolume, benchmarkSettings)}
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Consultants présents sur l&apos;exercice uniquement — hors ceux partis avant la période ou
            inscrits après. Consultant actif = au moins 1 € de volume propre. Référence groupe
            modifiable via « Références » en haut de page.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <OrganisationListButton
              label="Consultants actifs (≥ 1 €)"
              count={stats.countedCount}
              onClick={() => onOpenList("withVolume")}
            />
            <OrganisationListButton
              label="Consultants inactifs"
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
  exerciceLabel,
  exerciceStats,
  cumulativeStats,
  onOpenList,
}: {
  loading: boolean;
  exerciceLabel: string;
  exerciceStats: FilleulParraineurStatResult;
  cumulativeStats: FilleulParraineurStatResult;
  onOpenList: (kind: FilleulParraineurListKind) => void;
}) {
  const benchmarkSettings = useStatistiquesBenchmarkSettings();
  const benchmarkStatus =
    exerciceStats.totalCount > 0
      ? getFilleulSponsorRateBenchmarkStatus(exerciceStats.parraineurPercent, benchmarkSettings)
      : null;

  return (
    <StatistiquesPanel
      title="Taux de parrainage"
      description={`Sur l'exercice ${exerciceLabel}, part des consultants réseau (inscrits ou désinscrits sur la période) ayant parrainé au moins une personne affiliée durant l'exercice (01/08–31/07), y compris filleuls parrainés désinscrits depuis.`}
      collapsible
      panelId="filleul_org_parraineur"
    >
      {loading ? (
        <ChartLoading />
      ) : exerciceStats.totalCount === 0 ? (
        <ChartEmpty title="Aucun consultant réseau éligible pour cette statistique." height={180} />
      ) : (
        <div className="space-y-4">
          <div
            className={cn(
              "rounded-xl border px-4 py-3 flex items-center justify-between gap-4 transition-colors",
              benchmarkStatus
                ? filleulVolumeBenchmarkStatusBoxClasses(benchmarkStatus)
                : "border-border/60 bg-muted/20"
            )}
            title={benchmarkStatus ? filleulVolumeBenchmarkStatusLabel(benchmarkStatus) : undefined}
          >
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Exercice {exerciceLabel}
              </p>
              <p
                className={cn(
                  "text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5",
                  benchmarkStatus
                    ? filleulVolumeBenchmarkStatusValueClasses(benchmarkStatus)
                    : "text-primary"
                )}
              >
                {formatFilleulManagerPercent(exerciceStats.parraineurPercent)}
              </p>
            </div>
            <div className="text-xs text-muted-foreground text-right max-w-xs space-y-0.5">
              <p>{formatFilleulParraineurExerciceSubtitle(exerciceStats, exerciceLabel)}</p>
              <p className="tabular-nums">
                Réf. groupe {formatFilleulManagerPercent(benchmarkSettings.groupSponsorRatePercent)}
              </p>
              <p className="font-medium text-foreground tabular-nums">
                {formatSponsorRateVsGroupBenchmarkPercent(
                  exerciceStats.parraineurPercent,
                  benchmarkSettings
                )}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Indice historique (cumul)
            </p>
            <p className="text-sm font-medium tabular-nums text-foreground mt-0.5">
              {formatFilleulParraineurCumulativeIndex(cumulativeStats)}
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Filleuls inscrits ayant parrainé au moins une fois, toutes périodes — indépendant de
              l&apos;exercice sélectionné.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Parrainages de l&apos;exercice : date d&apos;inscription du filleul parrainé (ou
            d&apos;invitation si prospect) — désinscrits comptés si affiliation dans la période.
            Référence groupe via « Références » en haut de page.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <OrganisationListButton
              label="Parraineurs (exercice)"
              count={exerciceStats.parraineurCount}
              onClick={() => onOpenList("parraineur")}
            />
            <OrganisationListButton
              label="Sans parrainage (exercice)"
              count={exerciceStats.otherContactIds.length}
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

export function ContactFilleulOrganisationPanel({
  onNavigate,
}: ContactFilleulOrganisationPanelProps) {
  const { contacts, selfContactId, loading, dataRefreshKey, refreshData } =
    useStatistiquesPageData();
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [drillDown, setDrillDown] = useState<OrganisationDrillDown | null>(null);
  const [closedLabels, setClosedLabels] = useState<string[]>([]);
  const [selectedExercice, setSelectedExercice] =
    useState<OrganisationExerciceSelection>(ORGANISATION_CURRENT_EXERCICE);
  const [historyRecords, setHistoryRecords] = useState<
    Awaited<ReturnType<typeof getFilleulVolumeExercicesByLabel>>
  >([]);
  const [dossiersByContactId, setDossiersByContactId] = useState<Map<number, FilleulDossier>>(
    new Map()
  );
  const [dossiersLoading, setDossiersLoading] = useState(false);
  const [dossiersReadyKey, setDossiersReadyKey] = useState("");

  useEffect(() => {
    void listFilleulVolumeExerciceLabels().then(setClosedLabels).catch(console.error);
  }, [dataRefreshKey]);

  const resolvedExerciceLabel = useMemo(
    () => resolveOrganisationExerciceLabel(selectedExercice),
    [selectedExercice]
  );

  const viewingCurrentExercice = useMemo(
    () =>
      isCurrentOrganisationExercice(selectedExercice) ||
      (selectedExercice === currentFiscalYearLabel() &&
        !closedLabels.includes(selectedExercice)),
    [selectedExercice, closedLabels]
  );

  useEffect(() => {
    if (viewingCurrentExercice) {
      setHistoryRecords([]);
      return;
    }
    setHistoryRecords([]);
    void getFilleulVolumeExercicesByLabel(resolvedExerciceLabel)
      .then(setHistoryRecords)
      .catch(console.error);
  }, [resolvedExerciceLabel, viewingCurrentExercice, dataRefreshKey]);

  const contactsForStats = useMemo(() => {
    if (viewingCurrentExercice) return contacts;
    return applyExerciceVolumesToContacts(
      contacts,
      indexFilleulVolumeExercicesByContactId(historyRecords)
    );
  }, [contacts, viewingCurrentExercice, historyRecords]);

  const selfContact = useMemo(
    () => contactsForStats.find((contact) => contact.id === selfContactId) ?? null,
    [contactsForStats, selfContactId]
  );

  const dossierContactIds = useMemo(() => {
    const ids = new Set(collectOrganisationDossierContactIds(contactsForStats, selfContact));
    for (const contact of contactsForStats) {
      if (contact.id == null) continue;
      if (
        isFilleulParrainableDownline(contact) ||
        isContactEligibleForFilleulParraineurStats(contact)
      ) {
        ids.add(contact.id);
      }
    }
    return [...ids];
  }, [contactsForStats, selfContact]);

  const dossierContactIdsKey = useMemo(
    () => (dossierContactIds.length === 0 ? "" : dossierContactIds.slice().sort((a, b) => a - b).join(",")),
    [dossierContactIds]
  );

  useEffect(() => {
    let cancelled = false;
    if (dossierContactIds.length === 0) {
      setDossiersByContactId(new Map());
      setDossiersLoading(false);
      setDossiersReadyKey("");
      return;
    }
    const requestKey = dossierContactIdsKey;
    setDossiersLoading(true);
    void getFilleulDossiersByContactIds(dossierContactIds)
      .then((dossiers) => {
        if (cancelled) return;
        setDossiersByContactId(indexFilleulDossiersByContactId(dossiers));
        setDossiersReadyKey(requestKey);
        setDossiersLoading(false);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setDossiersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dossierContactIds, dossierContactIdsKey, dataRefreshKey]);

  const exerciceKpisLoading =
    loading || (dossierContactIdsKey !== "" && (dossiersLoading || dossiersReadyKey !== dossierContactIdsKey));

  const parraineurStatsOptions = useMemo(
    () => ({ dossiersByContactId }),
    [dossiersByContactId]
  );

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

  const statsOptions = useMemo(() => ({ selfContactId }), [selfContactId]);

  const managerStats = useMemo(() => computeFilleulManagerStats(contactsForStats), [contactsForStats]);
  const volumeStats = useMemo(
    () =>
      computeFilleulAverageVolumeExerciceStats(
        contactsForStats,
        resolvedExerciceLabel,
        parraineurStatsOptions
      ),
    [contactsForStats, resolvedExerciceLabel, parraineurStatsOptions]
  );
  const parraineurExerciceStats = useMemo(
    () =>
      computeFilleulParraineurExerciceStats(
        contactsForStats,
        resolvedExerciceLabel,
        parraineurStatsOptions
      ),
    [contactsForStats, resolvedExerciceLabel, parraineurStatsOptions]
  );
  const parraineurCumulativeStats = useMemo(
    () => computeFilleulParraineurStats(contactsForStats),
    [contactsForStats]
  );
  const bridgeStats = useMemo(
    () => computeFilleulClientBridgeStats(contactsForStats, statsOptions),
    [contactsForStats, statsOptions]
  );
  const filleulAttritionExerciceStats = useMemo(
    () =>
      computeFilleulAttritionExerciceStats(
        contactsForStats,
        resolvedExerciceLabel,
        parraineurStatsOptions
      ),
    [contactsForStats, resolvedExerciceLabel, parraineurStatsOptions]
  );
  const filleulAttritionCumulativeStats = useMemo(
    () => computeFilleulAttritionStats(contactsForStats),
    [contactsForStats]
  );

  const loadContactsSheet = useCallback(async () => {
    if (!drillDown) return [];
    if (drillDown.mode === "manager") {
      return toDashboardStatContactList(
        filterContactsForFilleulOrganisationList(contactsForStats, drillDown.kind)
      );
    }
    if (drillDown.mode === "parraineur") {
      return toDashboardStatContactList(
        filterContactsForFilleulParraineurExerciceList(
          contactsForStats,
          drillDown.kind,
          resolvedExerciceLabel,
          parraineurStatsOptions
        )
      );
    }
    if (drillDown.mode === "bridge") {
      return toDashboardStatContactList(
        filterContactsForFilleulBridgeList(contactsForStats, drillDown.kind, statsOptions)
      );
    }
    if (drillDown.mode === "attrition") {
      return toDashboardStatContactList(
        filterContactsForFilleulAttritionExerciceLens(
          contactsForStats,
          drillDown.kind,
          resolvedExerciceLabel,
          parraineurStatsOptions
        )
      );
    }
    if (drillDown.mode === "volume") {
      return toDashboardStatContactList(
        filterContactsForFilleulVolumeExerciceList(
          contactsForStats,
          drillDown.kind,
          resolvedExerciceLabel,
          parraineurStatsOptions
        )
      );
    }
    return [];
  }, [contactsForStats, drillDown, statsOptions, parraineurStatsOptions, resolvedExerciceLabel]);

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
      setDrillDown({ mode: "attrition", kind, count });
      setContactsSheetOpen(true);
    },
    []
  );

  const drillDownTitle = useCallback(
    (dd: OrganisationDrillDown): string => {
      if (dd.mode === "manager") {
        return dd.kind === "manager"
          ? "Filleuls Managers — inscrits"
          : "Filleuls inscrits — hors Manager";
      }
      if (dd.mode === "parraineur") {
        return dd.kind === "parraineur"
          ? `Consultants réseau — parraineurs exercice ${resolvedExerciceLabel}`
          : `Consultants réseau — sans parrainage exercice ${resolvedExerciceLabel}`;
      }
      if (dd.mode === "bridge") {
        return dd.kind === "bridge"
          ? "Filleuls directs — avec statut client"
          : "Filleuls directs — filleuls seuls";
      }
      if (dd.mode === "attrition") {
        return dd.kind === "attrited"
          ? `Désinscriptions exercice ${resolvedExerciceLabel}`
          : `Cohorte au 01/08 — sans départ exercice ${resolvedExerciceLabel}`;
      }
      return dd.kind === "withVolume"
        ? `Consultants actifs (≥ 1 €) — exercice ${resolvedExerciceLabel}`
        : `Consultants inactifs — exercice ${resolvedExerciceLabel}`;
    },
    [resolvedExerciceLabel]
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
        ? parraineurExerciceStats.parraineurCount
        : parraineurExerciceStats.otherContactIds.length;
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
      ? volumeStats.countedCount
      : volumeStats.missingVolumeCount;
  }, [drillDown, managerStats, parraineurExerciceStats, bridgeStats, volumeStats]);

  const sheetDescription = useMemo(() => {
    if (!drillDown || sheetCount === 0) return undefined;
    if (drillDown.mode === "manager") {
      return `${sheetCount} filleul${sheetCount > 1 ? "s" : ""} · ${formatFilleulManagerPercent(managerStats.managerPercent)} Managers au total`;
    }
    if (drillDown.mode === "parraineur") {
      return `${sheetCount} filleul${sheetCount > 1 ? "s" : ""} · ${formatFilleulManagerPercent(parraineurExerciceStats.parraineurPercent)} parraineurs exercice ${resolvedExerciceLabel} · cumul ${formatFilleulManagerPercent(parraineurCumulativeStats.parraineurPercent)}`;
    }
    if (drillDown.mode === "bridge") {
      return `${sheetCount} filleul${sheetCount > 1 ? "s" : ""} · ${formatFilleulManagerPercent(bridgeStats.bridgePercent)} double rôle au total`;
    }
    if (drillDown.mode === "attrition") {
      return `${sheetCount} contact${sheetCount > 1 ? "s" : ""} — ${formatDashboardPercent(
        sheetCount,
        filleulAttritionExerciceStats.totalCount
      )} de la cohorte exercice ${resolvedExerciceLabel}`;
    }
    if (drillDown.kind === "withVolume" && volumeStats.averageVolume != null) {
      return `${sheetCount} filleul${sheetCount > 1 ? "s" : ""} · volume moyen ${formatFilleulVolumeDisplay(volumeStats.averageVolume)}`;
    }
    return `${sheetCount} filleul${sheetCount > 1 ? "s" : ""}`;
  }, [drillDown, sheetCount, managerStats.managerPercent, parraineurExerciceStats.parraineurPercent, parraineurCumulativeStats.parraineurPercent, bridgeStats.bridgePercent, filleulAttritionExerciceStats.totalCount, volumeStats.averageVolume, resolvedExerciceLabel]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <p className="text-sm text-muted-foreground">
          Volumes et KPIs réseau pour l&apos;exercice sélectionné.
        </p>
        <OrganisationExerciceSelector
          closedLabels={closedLabels}
          value={selectedExercice}
          onValueChange={setSelectedExercice}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <ContactGeographyPanel onNavigate={onNavigate} lens="filleul" />
        <ContactAgePanel onNavigate={onNavigate} lens="filleul" />
        <ManagerKpiPanel loading={loading} stats={managerStats} onOpenList={openManagerList} />
        <VolumeKpiPanel
          loading={exerciceKpisLoading}
          exerciceLabel={resolvedExerciceLabel}
          stats={volumeStats}
          onOpenList={openVolumeList}
        />
        <ParraineurKpiPanel
          loading={exerciceKpisLoading}
          exerciceLabel={resolvedExerciceLabel}
          exerciceStats={parraineurExerciceStats}
          cumulativeStats={parraineurCumulativeStats}
          onOpenList={openParraineurList}
        />
        <BridgeKpiPanel loading={loading} stats={bridgeStats} onOpenList={openBridgeList} />
        <div className="lg:col-span-2">
          <AttritionKpiPanel
            panelId="attrition_filleul"
            title="Attrition"
            description={`Désinscriptions sur l'exercice ${resolvedExerciceLabel} : part des départs parmi la cohorte présente au 1er août (date de désinscription dans le dossier filleul).`}
            loading={exerciceKpisLoading}
            stats={filleulAttritionExerciceStats}
            exerciceLabel={resolvedExerciceLabel}
            cumulativeStats={filleulAttritionCumulativeStats}
            formatExerciceSubtitle={formatFilleulAttritionExerciceSubtitle}
            formatCumulativeIndex={formatFilleulAttritionCumulativeIndex}
            activeLabel="Cohorte sans départ"
            attritedLabel="Désinscriptions exercice"
            hint="Cohorte = consultants présents au 01/08. Un départ compte si la date de désinscription tombe dans l'exercice. Prospects et suspects filleuls exclus."
            onOpenList={(kind) => openFilleulAttritionList(kind, filleulAttritionExerciceStats)}
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
