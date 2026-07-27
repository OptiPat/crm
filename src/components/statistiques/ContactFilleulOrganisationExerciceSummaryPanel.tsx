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
import { ChartLoading } from "@/components/dashboard/dashboard-ui";
import { Button } from "@/components/ui/button";
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

  const canExpand = allExerciceLabels.length > FILLEUL_ORGANISATION_EXERCICE_SUMMARY_DEFAULT_COUNT;
  const loading = dossiersLoading || historyLoading;

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
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left">
                  <th
                    className="px-3 py-2 text-xs font-medium text-muted-foreground sticky left-0 bg-muted/30 z-10 min-w-[9rem]"
                  >
                    Indicateur
                  </th>
                  {summaryRows.map((row) => (
                    <th
                      key={row.exerciceLabel}
                      className="px-3 py-2 text-xs font-medium text-muted-foreground text-right whitespace-nowrap"
                    >
                      {row.exerciceLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FILLEUL_ORGANISATION_EXERCICE_SUMMARY_METRICS.map((metric) => (
                  <tr key={metric.id} className="border-b border-border/30 last:border-0">
                    <td
                      className={cn(
                        "px-3 py-2 text-xs text-muted-foreground sticky left-0 bg-card z-10",
                        metric.id === "inscribedConsultantCount" && "font-medium text-foreground",
                        metric.id === "organisationBranchVolume" && "font-medium text-foreground"
                      )}
                    >
                      {metric.label}
                    </td>
                    {summaryRows.map((row) => (
                      <td
                        key={`${metric.id}-${row.exerciceLabel}`}
                        className={cn(
                          "px-3 py-2 text-right tabular-nums text-sm",
                          metric.id === "inscribedConsultantCount" && "font-medium",
                          metric.id === "organisationBranchVolume" && "font-medium"
                        )}
                      >
                        {metric.format(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
