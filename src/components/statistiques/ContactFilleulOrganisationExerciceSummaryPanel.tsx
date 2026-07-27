import { useEffect, useMemo, useState } from "react";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import type { FilleulVolumeExercice } from "@/lib/api/tauri-filleul-volumes";
import { getFilleulVolumeExercicesByLabel } from "@/lib/api/tauri-filleul-volumes";
import {
  buildFilleulOrganisationExerciceLabels,
  computeFilleulOrganisationExerciceSummary,
  FILLEUL_ORGANISATION_EXERCICE_SUMMARY_DEFAULT_COUNT,
  FILLEUL_ORGANISATION_EXERCICE_SUMMARY_METRICS,
  isLiveFilleulExerciceVolumes,
  pickFilleulOrganisationExerciceLabelsForDisplay,
} from "@/lib/statistiques/filleul-organisation-exercice-summary";
import {
  computeFilleulPersoJdExerciceSummary,
  FILLEUL_PERSO_JD_EXERCICE_SUMMARY_METRICS,
  type FilleulPersoJdExerciceSummaryMetricId,
} from "@/lib/statistiques/filleul-perso-jd-exercice-stats";
import { ChartLoading } from "@/components/dashboard/dashboard-ui";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatistiquesPanel } from "./statistiques-ui";
import { cn } from "@/lib/utils";

type ContactFilleulOrganisationExerciceSummaryPanelProps = {
  contacts: Contact[];
  historyExerciceLabels: string[];
  closedExerciceLabels: string[];
  organisationSelfContactId: number | null;
  dossiersByContactId: Map<number, FilleulDossier>;
  cgp: CgpConfig | null;
  dossiersLoading: boolean;
  dataRefreshKey: string | number;
  onOpenConsultantsList?: (exerciceLabel: string, count: number) => void;
  onOpenParrainagesList?: (exerciceLabel: string, count: number) => void;
  onOpenPersoJdList?: (
    exerciceLabel: string,
    kind: FilleulPersoJdExerciceSummaryMetricId,
    count: number
  ) => void;
};

export function ContactFilleulOrganisationExerciceSummaryPanel({
  contacts,
  historyExerciceLabels,
  closedExerciceLabels,
  organisationSelfContactId,
  dossiersByContactId,
  cgp,
  dossiersLoading,
  dataRefreshKey,
  onOpenConsultantsList,
  onOpenParrainagesList,
  onOpenPersoJdList,
}: ContactFilleulOrganisationExerciceSummaryPanelProps) {
  const [showAllExercices, setShowAllExercices] = useState(false);
  const [historyByLabel, setHistoryByLabel] = useState<Map<string, FilleulVolumeExercice[]>>(
    new Map()
  );
  const [historyLoading, setHistoryLoading] = useState(false);

  const allExerciceLabels = useMemo(
    () => buildFilleulOrganisationExerciceLabels(historyExerciceLabels),
    [historyExerciceLabels]
  );

  const labelsNeedingHistory = useMemo(
    () =>
      allExerciceLabels.filter((label) => !isLiveFilleulExerciceVolumes(label, closedExerciceLabels)),
    [allExerciceLabels, closedExerciceLabels]
  );

  useEffect(() => {
    let cancelled = false;
    if (labelsNeedingHistory.length === 0) {
      setHistoryByLabel(new Map());
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    void Promise.all(
      labelsNeedingHistory.map(async (label) => {
        const records = await getFilleulVolumeExercicesByLabel(label);
        return { label, records };
      })
    )
      .then((results) => {
        if (cancelled) return;
        const map = new Map<string, FilleulVolumeExercice[]>();
        for (const { label, records } of results) {
          map.set(label, records);
        }
        setHistoryByLabel(map);
        setHistoryLoading(false);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setHistoryByLabel(new Map());
          setHistoryLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [labelsNeedingHistory, dataRefreshKey]);

  const displayedExerciceLabels = useMemo(
    () => pickFilleulOrganisationExerciceLabelsForDisplay(allExerciceLabels, showAllExercices),
    [allExerciceLabels, showAllExercices]
  );

  const persoSummaryRows = useMemo(() => {
    if (dossiersLoading || historyLoading) return [];
    return computeFilleulPersoJdExerciceSummary(displayedExerciceLabels, contacts, {
      dossiersByContactId,
      organisationSelfContactId,
    });
  }, [
    displayedExerciceLabels,
    contacts,
    dossiersByContactId,
    organisationSelfContactId,
    dossiersLoading,
    historyLoading,
  ]);

  const allPersoSummaryRows = useMemo(() => {
    if (dossiersLoading || historyLoading) return [];
    return computeFilleulPersoJdExerciceSummary(allExerciceLabels, contacts, {
      dossiersByContactId,
      organisationSelfContactId,
    });
  }, [
    allExerciceLabels,
    contacts,
    dossiersByContactId,
    organisationSelfContactId,
    dossiersLoading,
    historyLoading,
  ]);

  const summaryRows = useMemo(() => {
    if (dossiersLoading || historyLoading) return [];
    return computeFilleulOrganisationExerciceSummary(displayedExerciceLabels, {
      contacts,
      closedExerciceLabels,
      organisationSelfContactId,
      dossiersByContactId,
      cgp: cgp ?? undefined,
      historyRecordsByLabel: historyByLabel,
    });
  }, [
    displayedExerciceLabels,
    contacts,
    closedExerciceLabels,
    organisationSelfContactId,
    dossiersByContactId,
    cgp,
    historyByLabel,
    dossiersLoading,
    historyLoading,
  ]);

  const allSummaryRows = useMemo(() => {
    if (dossiersLoading || historyLoading) return [];
    return computeFilleulOrganisationExerciceSummary(allExerciceLabels, {
      contacts,
      closedExerciceLabels,
      organisationSelfContactId,
      dossiersByContactId,
      cgp: cgp ?? undefined,
      historyRecordsByLabel: historyByLabel,
    });
  }, [
    allExerciceLabels,
    contacts,
    closedExerciceLabels,
    organisationSelfContactId,
    dossiersByContactId,
    cgp,
    historyByLabel,
    dossiersLoading,
    historyLoading,
  ]);

  const canExpand = allExerciceLabels.length > FILLEUL_ORGANISATION_EXERCICE_SUMMARY_DEFAULT_COUNT;
  const loading = dossiersLoading || historyLoading;

  function renderSummaryTable<TRow extends { exerciceLabel: string }>(
    metrics: Array<{
      id: string;
      label: string;
      format: (row: TRow) => string;
      formatTotal: (rows: TRow[]) => string;
    }>,
    rows: TRow[],
    totalRows: TRow[],
    getCount?: (metricId: string, row: TRow) => number | null
  ) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left">
              <th
                className="px-3 py-2 text-xs font-medium text-muted-foreground sticky left-0 bg-muted/30 z-10 min-w-[9rem]"
              >
                Indicateur
              </th>
              {rows.map((row) => (
                <th
                  key={row.exerciceLabel}
                  className="px-3 py-2 text-xs font-medium text-muted-foreground text-right whitespace-nowrap"
                >
                  {row.exerciceLabel}
                </th>
              ))}
              <th
                className="px-3 py-2 text-xs font-medium text-foreground text-right whitespace-nowrap border-l border-border/50 bg-muted/40"
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.id} className="border-b border-border/30 last:border-0">
                <td
                  className={cn(
                    "px-3 py-2 text-xs text-muted-foreground sticky left-0 bg-card z-10",
                    metric.id === "inscribedConsultantCount" && "font-medium text-foreground",
                    metric.id === "organisationBranchVolume" && "font-medium text-foreground",
                    metric.id === "jdInvitationCount" && "font-medium text-foreground",
                    metric.id === "conversionRate" && "font-medium text-foreground"
                  )}
                >
                  {metric.label}
                </td>
                {rows.map((row) => {
                  const cellValue = metric.format(row);
                  const count = getCount?.(metric.id, row);
                  const clickable = count != null && count > 0;

                  return (
                    <td
                      key={`${metric.id}-${row.exerciceLabel}`}
                      className={cn(
                        "px-3 py-2 text-right tabular-nums text-sm",
                        metric.id === "inscribedConsultantCount" && "font-medium",
                        metric.id === "organisationBranchVolume" && "font-medium",
                        metric.id === "conversionRate" && "font-medium"
                      )}
                    >
                      {clickable ? (
                        <button
                          type="button"
                          className={cn(
                            "rounded px-1 -mx-1 hover:bg-muted/60 hover:text-primary transition-colors underline-offset-2 hover:underline",
                            metric.id === "inscribedConsultantCount" && "font-medium"
                          )}
                          onClick={() => {
                            if (metric.id === "inscribedConsultantCount" && onOpenConsultantsList) {
                              onOpenConsultantsList(row.exerciceLabel, count!);
                            } else if (metric.id === "parrainageCount" && onOpenParrainagesList) {
                              onOpenParrainagesList(row.exerciceLabel, count!);
                            } else if (onOpenPersoJdList) {
                              onOpenPersoJdList(
                                row.exerciceLabel,
                                metric.id as FilleulPersoJdExerciceSummaryMetricId,
                                count!
                              );
                            }
                          }}
                        >
                          {cellValue}
                        </button>
                      ) : (
                        cellValue
                      )}
                    </td>
                  );
                })}
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums text-sm border-l border-border/50 bg-muted/10",
                    metric.id === "inscribedConsultantCount" && "font-medium",
                    metric.id === "organisationBranchVolume" && "font-medium",
                    metric.id === "conversionRate" && "font-medium",
                    metric.id === "jdInvitationCount" && "font-medium"
                  )}
                >
                  {metric.formatTotal(totalRows)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <StatistiquesPanel
      title="Synthèse par exercice"
      description="Comparatif exercice après exercice"
      collapsible
      panelId="filleul_org_exercice_summary"
    >
      {loading ? (
        <ChartLoading />
      ) : summaryRows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Aucun exercice disponible pour la synthèse.
        </p>
      ) : (
        <div className="space-y-3">
          <Tabs defaultValue="reseau">
            <TabsList className="h-9">
              <TabsTrigger value="reseau" className="text-xs px-3">
                Réseau
              </TabsTrigger>
              <TabsTrigger value="perso" className="text-xs px-3">
                Perso
              </TabsTrigger>
            </TabsList>
            <TabsContent value="reseau" className="mt-3">
              {renderSummaryTable(
                FILLEUL_ORGANISATION_EXERCICE_SUMMARY_METRICS,
                summaryRows,
                allSummaryRows,
                (metricId, row) => {
                  if (metricId === "inscribedConsultantCount") return row.inscribedConsultantCount;
                  if (metricId === "parrainageCount") return row.parrainageCount;
                  return null;
                }
              )}
            </TabsContent>
            <TabsContent value="perso" className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Journée découverte (JD) · filleuls rattachés à vous — invitations et présences sur
                la date d&apos;invitation de l&apos;exercice ; inscrits sur la date
                d&apos;inscription de l&apos;exercice (filleuls désinscrits inclus ; repli
                invitation si inscription absente). Total : cumul sur tous les exercices
                disponibles, même repliés.
              </p>
              {renderSummaryTable(
                FILLEUL_PERSO_JD_EXERCICE_SUMMARY_METRICS,
                persoSummaryRows,
                allPersoSummaryRows,
                (metricId, row) => {
                  if (metricId === "jdInvitationCount") return row.jdInvitationCount;
                  if (metricId === "jdPresenceCount") return row.jdPresenceCount;
                  if (metricId === "inscribedCount") return row.inscribedCount;
                  return null;
                }
              )}
            </TabsContent>
          </Tabs>

          {canExpand ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs h-8"
                onClick={() => setShowAllExercices((prev) => !prev)}
              >
                {showAllExercices
                  ? `Afficher les ${FILLEUL_ORGANISATION_EXERCICE_SUMMARY_DEFAULT_COUNT} derniers exercices`
                  : `Afficher tous les exercices (${allExerciceLabels.length})`}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </StatistiquesPanel>
  );
}
