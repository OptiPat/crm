import { useEffect, useMemo, useState } from "react";
import { useJdFunnelTracker } from "@/hooks/useJdFunnelTracker";
import { currentFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";
import { computeGrowthObjective } from "@/lib/statistiques/organisation-growth-objective";
import {
  loadOrganisationObjectifTablePrefs,
  saveOrganisationObjectifTablePrefs,
} from "@/lib/statistiques/organisation-objectif-table-preferences";
import type { StatistiquesBenchmarkSettings } from "@/lib/statistiques/statistiques-benchmark-settings";
import { ChartLoading } from "@/components/dashboard/dashboard-ui";
import { cn } from "@/lib/utils";
import { JdFunnelCounterCell } from "./JdFunnelCounterCell";
import { OrganisationGrowthProjectionPanel } from "./OrganisationGrowthProjectionPanel";
import {
  AssumptionField,
  DeltaBadge,
  formatCount,
  formatCountDelta,
  formatRatio,
  formatVolume,
  formatVolumeDelta,
  VolumeProgressGauge,
} from "./objectif-table-shared";
import { StatistiquesPanel } from "./statistiques-ui";

const DEFAULT_JD_RATE_PERCENT = 50;

export function OrganisationObjectifTablePanel({
  loading,
  exerciceLabel,
  currentConsultantCount,
  defaultAttritionPercent,
  currentSponsorsCount,
  currentSponsorsRatePercent,
  currentPersonalVolume,
  currentTeamAverageVolume,
  currentTeamActiveConsultantCount,
  currentTeamActiveRatePercent,
  defaultTargetGrowthPercent,
  benchmarkSettings,
}: {
  loading: boolean;
  /** Exercice affiché par le sélecteur du panneau (« Objectif » porte sur la fin de cet exercice). */
  exerciceLabel: string;
  currentConsultantCount: number | null;
  defaultAttritionPercent: number | null;
  currentSponsorsCount: number | null;
  /**
   * Taux de parraineurs observé (%) — calculé sur les mêmes consultants « survivants » que
   * `currentConsultantCount` (encore inscrits à la clôture), PAS sur la base plus large (présents à
   * un moment de l'exercice, désinscrits compris) utilisée par le « Taux de parraineurs » affiché
   * ailleurs dans le panneau. Sert uniquement de valeur par défaut/tooltip pour le champ visé, afin
   * que le calcul (effectif visé × taux) reste cohérent avec `currentConsultantCount`.
   */
  currentSponsorsRatePercent: number | null;
  currentPersonalVolume: number | null;
  currentTeamAverageVolume: number | null;
  currentTeamActiveConsultantCount: number | null;
  /**
   * Taux d'actifs équipe observé (%, hors soi) — calculé sur les mêmes consultants « survivants »
   * que `currentConsultantCount`, PAS sur la base plus large (désinscrits compris) utilisée par le
   * « Taux d'actifs » affiché ailleurs dans le panneau (cf. `currentSponsorsRatePercent`).
   */
  currentTeamActiveRatePercent: number | null;
  defaultTargetGrowthPercent: number;
  /** Références groupe (nationales) affichées en tooltip sur les champs éditables. */
  benchmarkSettings: StatistiquesBenchmarkSettings;
}) {
  const defaultTeamActiveRatePercent =
    currentTeamActiveRatePercent != null ? Math.round(currentTeamActiveRatePercent * 10) / 10 : 0;
  const defaultSponsorsRatePercent =
    currentSponsorsRatePercent != null ? Math.round(currentSponsorsRatePercent * 10) / 10 : 0;

  // Lu une seule fois au montage : les hypothèses personnalisées (différentes de la valeur
  // observée) sont conservées d'une session à l'autre, cf. organisation-objectif-table-preferences.ts.
  const persistedPrefs = useMemo(() => loadOrganisationObjectifTablePrefs(), []);

  const [targetGrowthPercent, setTargetGrowthPercentState] = useState(
    persistedPrefs.targetGrowthPercent ?? defaultTargetGrowthPercent
  );
  const [attritionPercent, setAttritionPercentState] = useState(
    persistedPrefs.attritionPercent ?? (defaultAttritionPercent ?? 0)
  );
  const [targetPersonalVolume, setTargetPersonalVolumeState] = useState(
    persistedPrefs.targetPersonalVolume ?? Math.round(currentPersonalVolume ?? 0)
  );
  const [targetTeamAverageVolume, setTargetTeamAverageVolumeState] = useState(
    persistedPrefs.targetTeamAverageVolume ?? Math.round(currentTeamAverageVolume ?? 0)
  );
  const [targetTeamActiveRatePercent, setTargetTeamActiveRatePercentState] = useState(
    persistedPrefs.targetTeamActiveRatePercent ?? defaultTeamActiveRatePercent
  );
  const [targetSponsorsRatePercent, setTargetSponsorsRatePercentState] = useState(
    persistedPrefs.targetSponsorsRatePercent ?? defaultSponsorsRatePercent
  );
  const [jdPresenceToRecruitRatePercent, setJdPresenceToRecruitRatePercentState] = useState(
    persistedPrefs.jdPresenceToRecruitRatePercent ?? DEFAULT_JD_RATE_PERCENT
  );
  const [jdConfirmationToPresenceRatePercent, setJdConfirmationToPresenceRatePercentState] = useState(
    persistedPrefs.jdConfirmationToPresenceRatePercent ?? DEFAULT_JD_RATE_PERCENT
  );

  // Ne resynchronise sur la valeur observée que si l'utilisateur n'a pas de préférence enregistrée
  // pour ce champ — sinon une préférence persistée serait écrasée dès que les données réelles
  // (souvent chargées de façon asynchrone) arrivent ou changent.
  useEffect(() => {
    if (persistedPrefs.targetGrowthPercent == null) {
      setTargetGrowthPercentState(defaultTargetGrowthPercent);
    }
  }, [defaultTargetGrowthPercent, persistedPrefs.targetGrowthPercent]);

  useEffect(() => {
    if (persistedPrefs.attritionPercent == null) {
      setAttritionPercentState(defaultAttritionPercent ?? 0);
    }
  }, [defaultAttritionPercent, persistedPrefs.attritionPercent]);

  useEffect(() => {
    if (persistedPrefs.targetPersonalVolume == null) {
      setTargetPersonalVolumeState(Math.round(currentPersonalVolume ?? 0));
    }
  }, [currentPersonalVolume, persistedPrefs.targetPersonalVolume]);

  useEffect(() => {
    if (persistedPrefs.targetTeamAverageVolume == null) {
      setTargetTeamAverageVolumeState(Math.round(currentTeamAverageVolume ?? 0));
    }
  }, [currentTeamAverageVolume, persistedPrefs.targetTeamAverageVolume]);

  useEffect(() => {
    if (persistedPrefs.targetTeamActiveRatePercent == null) {
      setTargetTeamActiveRatePercentState(defaultTeamActiveRatePercent);
    }
  }, [defaultTeamActiveRatePercent, persistedPrefs.targetTeamActiveRatePercent]);

  useEffect(() => {
    if (persistedPrefs.targetSponsorsRatePercent == null) {
      setTargetSponsorsRatePercentState(defaultSponsorsRatePercent);
    }
  }, [defaultSponsorsRatePercent, persistedPrefs.targetSponsorsRatePercent]);

  // Wrappers qui persistent la saisie — sauf si elle revient à la valeur observée (le bouton
  // « réinitialiser » repasse alors le champ en suivi automatique, cf. useEffect ci-dessus).
  const setTargetGrowthPercent = (value: number) => {
    setTargetGrowthPercentState(value);
    saveOrganisationObjectifTablePrefs({
      targetGrowthPercent: value === defaultTargetGrowthPercent ? undefined : value,
    });
  };
  const setAttritionPercent = (value: number) => {
    setAttritionPercentState(value);
    saveOrganisationObjectifTablePrefs({
      attritionPercent: value === (defaultAttritionPercent ?? 0) ? undefined : value,
    });
  };
  const setTargetPersonalVolume = (value: number) => {
    setTargetPersonalVolumeState(value);
    saveOrganisationObjectifTablePrefs({
      targetPersonalVolume: value === Math.round(currentPersonalVolume ?? 0) ? undefined : value,
    });
  };
  const setTargetTeamAverageVolume = (value: number) => {
    setTargetTeamAverageVolumeState(value);
    saveOrganisationObjectifTablePrefs({
      targetTeamAverageVolume: value === Math.round(currentTeamAverageVolume ?? 0) ? undefined : value,
    });
  };
  const setTargetTeamActiveRatePercent = (value: number) => {
    setTargetTeamActiveRatePercentState(value);
    saveOrganisationObjectifTablePrefs({
      targetTeamActiveRatePercent: value === defaultTeamActiveRatePercent ? undefined : value,
    });
  };
  const setTargetSponsorsRatePercent = (value: number) => {
    setTargetSponsorsRatePercentState(value);
    saveOrganisationObjectifTablePrefs({
      targetSponsorsRatePercent: value === defaultSponsorsRatePercent ? undefined : value,
    });
  };
  const setJdPresenceToRecruitRatePercent = (value: number) => {
    setJdPresenceToRecruitRatePercentState(value);
    saveOrganisationObjectifTablePrefs({
      jdPresenceToRecruitRatePercent: value === DEFAULT_JD_RATE_PERCENT ? undefined : value,
    });
  };
  const setJdConfirmationToPresenceRatePercent = (value: number) => {
    setJdConfirmationToPresenceRatePercentState(value);
    saveOrganisationObjectifTablePrefs({
      jdConfirmationToPresenceRatePercent: value === DEFAULT_JD_RATE_PERCENT ? undefined : value,
    });
  };

  const jdFunnelTracker = useJdFunnelTracker();
  // Le volume « actuel » ne vaut comme progression que pour l'exercice en cours : un exercice futur
  // suivi en amont (funnel JD) n'a par définition encore aucun volume réel — la jauge doit rester à 0,
  // pas reprendre le volume de l'exercice en cours qui n'a rien à voir avec l'exercice suivi.
  const isTrackingCurrentExercice = jdFunnelTracker.exerciceLabel === currentFiscalYearLabel();

  const canCompute = currentConsultantCount != null && defaultAttritionPercent != null;
  const result = canCompute
    ? computeGrowthObjective({
        currentConsultantCount,
        attritionPercent,
        targetGrowthPercent,
        targetSponsorsRatePercent,
        currentPersonalVolume,
        targetPersonalVolume,
        currentTeamAverageVolume,
        targetTeamAverageVolume,
        currentTeamActiveConsultantCount,
        targetTeamActiveRatePercent,
        jdPresenceToRecruitRatePercent,
        jdConfirmationToPresenceRatePercent,
      })
    : null;

  // Même effectif/attrition/croissance que la colonne « Objectif » (partagés, pas de référence
  // groupe pour l'attrition) — seuls les taux et volumes visés basculent sur les références groupe,
  // pour comparer « à ma croissance visée, si je performais comme la moyenne du groupe ». Pas de
  // référence nationale pour le funnel JD non plus : mêmes taux JD que la colonne Objectif.
  const groupResult = canCompute
    ? computeGrowthObjective({
        currentConsultantCount,
        attritionPercent,
        targetGrowthPercent,
        targetSponsorsRatePercent: benchmarkSettings.groupSponsorRatePercent,
        currentPersonalVolume,
        targetPersonalVolume,
        currentTeamAverageVolume,
        targetTeamAverageVolume: benchmarkSettings.groupActiveConsultantVolumeEuros,
        currentTeamActiveConsultantCount,
        targetTeamActiveRatePercent: benchmarkSettings.groupActiveConsultantRatePercent,
        jdPresenceToRecruitRatePercent,
        jdConfirmationToPresenceRatePercent,
      })
    : null;

  return (
    <StatistiquesPanel
      title="Tableau d'objectifs (brouillon)"
      description="Combien parrainer cette année pour atteindre votre croissance visée — modifiez croissance, attrition, taux et volumes visés pour recalculer en direct, et comparez à une projection basée sur les références groupe."
      collapsible
      panelId="filleul_org_objectif_table"
    >
      {loading ? (
        <ChartLoading />
      ) : !canCompute || result == null || groupResult == null ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-2.5">
          Pas assez de données sur cet exercice pour calculer un objectif.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {formatCount(currentConsultantCount)} consultants actuels — ajustez les hypothèses ci-dessous.
            </p>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              Progression suivie pour l'exercice
              <select
                value={jdFunnelTracker.exerciceLabel}
                onChange={(e) => jdFunnelTracker.setExerciceLabel(e.target.value)}
                className="rounded-md border border-border/70 bg-background px-1.5 py-0.5 text-xs"
              >
                {jdFunnelTracker.exerciceOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            <AssumptionField
              id="objectif-croissance-input"
              label="Croissance visée"
              suffix="%"
              value={targetGrowthPercent}
              defaultValue={defaultTargetGrowthPercent}
              step={1}
              width="w-16"
              onChange={setTargetGrowthPercent}
              groupValue={benchmarkSettings.groupNetGrowthPercent}
            />
            <AssumptionField
              id="objectif-attrition-input"
              label="Attrition visée"
              suffix="%"
              value={attritionPercent}
              defaultValue={defaultAttritionPercent ?? 0}
              step={1}
              width="w-16"
              onChange={setAttritionPercent}
            />
            <AssumptionField
              id="objectif-taux-actifs-input"
              label="Taux d'actifs équipe visé"
              suffix="%"
              value={targetTeamActiveRatePercent}
              defaultValue={defaultTeamActiveRatePercent}
              step={1}
              width="w-16"
              onChange={setTargetTeamActiveRatePercent}
              groupValue={benchmarkSettings.groupActiveConsultantRatePercent}
            />
            <AssumptionField
              id="objectif-taux-parraineurs-input"
              label="Taux de parraineurs visé"
              suffix="%"
              value={targetSponsorsRatePercent}
              defaultValue={defaultSponsorsRatePercent}
              step={1}
              width="w-16"
              onChange={setTargetSponsorsRatePercent}
              groupValue={benchmarkSettings.groupSponsorRatePercent}
            />
            <AssumptionField
              id="objectif-volume-perso-input"
              label="Volume perso visé"
              suffix="€"
              value={targetPersonalVolume}
              defaultValue={Math.round(currentPersonalVolume ?? 0)}
              width="w-28"
              onChange={setTargetPersonalVolume}
              groupValue={benchmarkSettings.groupActiveConsultantVolumeEuros}
              mode="money"
            />
            <AssumptionField
              id="objectif-volume-equipe-input"
              label="Volume moyen orga/actif visé"
              suffix="€"
              value={targetTeamAverageVolume}
              defaultValue={Math.round(currentTeamAverageVolume ?? 0)}
              width="w-28"
              onChange={setTargetTeamAverageVolume}
              groupValue={benchmarkSettings.groupActiveConsultantVolumeEuros}
              mode="money"
            />
            <AssumptionField
              id="objectif-taux-presence-jd-input"
              label="Taux présent JD → parrainage"
              suffix="%"
              value={jdPresenceToRecruitRatePercent}
              defaultValue={DEFAULT_JD_RATE_PERCENT}
              step={1}
              width="w-16"
              onChange={setJdPresenceToRecruitRatePercent}
            />
            <AssumptionField
              id="objectif-taux-confirmation-jd-input"
              label='Taux "oui, je viens" → présent JD'
              suffix="%"
              value={jdConfirmationToPresenceRatePercent}
              defaultValue={DEFAULT_JD_RATE_PERCENT}
              step={1}
              width="w-16"
              onChange={setJdConfirmationToPresenceRatePercent}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/40">
                  <th className="px-3 py-2 text-left text-xs font-medium text-foreground">Indicateur</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-foreground whitespace-nowrap">
                    Actuel
                  </th>
                  <th
                    className={cn(
                      "px-3 py-2 text-right text-xs font-medium whitespace-nowrap border-l border-border/50",
                      "text-primary"
                    )}
                  >
                    Objectif (+{targetGrowthPercent} %)
                  </th>
                  <th
                    className={cn(
                      "px-3 py-2 text-right text-xs font-medium whitespace-nowrap border-l border-border/50",
                      "text-muted-foreground"
                    )}
                    title="Votre attrition visée, votre volume perso visé et votre croissance visée sont conservés (pas de référence nationale pour ces 3-là) — seuls le taux d'actifs équipe, le taux de parraineurs et le volume moyen équipe basculent sur les références groupe."
                  >
                    Groupe (+{targetGrowthPercent} %)
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/30 bg-muted/10">
                  <td className="px-3 py-2 text-foreground font-medium">Consultants (fin d'exercice)</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatCount(currentConsultantCount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium border-l border-border/50">
                    {formatCount(result.targetHeadcount)}
                    <DeltaBadge value={formatCountDelta(currentConsultantCount, result.targetHeadcount)} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground border-l border-border/50">
                    {formatCount(groupResult.targetHeadcount)}
                    <DeltaBadge value={formatCountDelta(currentConsultantCount, groupResult.targetHeadcount)} />
                  </td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="px-3 py-2 text-muted-foreground align-top">Parrainages à réaliser (brut)</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-right align-top border-l border-border/50">
                    <JdFunnelCounterCell
                      target={result.recruitsForTarget}
                      current={jdFunnelTracker.counts.parrainages}
                      onChange={(value) => jdFunnelTracker.setStageCount("parrainages", value)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground border-l border-border/50">
                    {formatCount(groupResult.recruitsForTarget)}
                  </td>
                </tr>
                <tr className="border-b border-border/30 bg-muted/10">
                  <td className="px-3 py-2 text-muted-foreground align-top">Présents JD à obtenir</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-right align-top border-l border-border/50">
                    <JdFunnelCounterCell
                      target={result.jdPresencesForTarget}
                      current={jdFunnelTracker.counts.presences}
                      onChange={(value) => jdFunnelTracker.setStageCount("presences", value)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground border-l border-border/50">
                    {formatCount(groupResult.jdPresencesForTarget)}
                  </td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="px-3 py-2 text-muted-foreground align-top">« Oui, je viens » à obtenir</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-right align-top border-l border-border/50">
                    <JdFunnelCounterCell
                      target={result.jdConfirmationsForTarget}
                      current={jdFunnelTracker.counts.confirmations}
                      onChange={(value) => jdFunnelTracker.setStageCount("confirmations", value)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground border-l border-border/50">
                    {formatCount(groupResult.jdConfirmationsForTarget)}
                  </td>
                </tr>
                <tr className="border-b border-border/30 bg-muted/10">
                  <td className="px-3 py-2 text-muted-foreground align-top">Parraineurs actifs</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground">
                    {formatCount(currentSponsorsCount)}
                  </td>
                  <td className="px-3 py-2 text-right align-top font-medium border-l border-border/50">
                    <div className="tabular-nums">{formatCount(result.sponsorsForTarget)}</div>
                    <div className="text-[11px] font-normal text-muted-foreground/70">
                      → {formatRatio(result.impliedRatioForTarget)} parrainages/parraineur
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right align-top text-muted-foreground border-l border-border/50">
                    <div className="tabular-nums">{formatCount(groupResult.sponsorsForTarget)}</div>
                    <div className="text-[11px] text-muted-foreground/70">
                      → {formatRatio(groupResult.impliedRatioForTarget)} parrainages/parraineur
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="px-3 py-2 text-muted-foreground align-top">Actifs organisation (hors moi)</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground">
                    {formatCount(currentTeamActiveConsultantCount)}
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular-nums font-medium border-l border-border/50">
                    <div>{formatRatio(result.targetTeamActiveCountRaw)}</div>
                    {result.targetTeamActiveCountRaw != null &&
                      result.targetTeamActiveCount != null &&
                      Math.abs(result.targetTeamActiveCountRaw - result.targetTeamActiveCount) > 0.05 && (
                        <div className="text-[11px] font-normal text-muted-foreground/70">
                          soit {formatCount(result.targetTeamActiveCount)} personnes
                        </div>
                      )}
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground border-l border-border/50">
                    <div>{formatRatio(groupResult.targetTeamActiveCountRaw)}</div>
                    {groupResult.targetTeamActiveCountRaw != null &&
                      groupResult.targetTeamActiveCount != null &&
                      Math.abs(groupResult.targetTeamActiveCountRaw - groupResult.targetTeamActiveCount) > 0.05 && (
                        <div className="text-[11px] text-muted-foreground/70">
                          soit {formatCount(groupResult.targetTeamActiveCount)} personnes
                        </div>
                      )}
                  </td>
                </tr>
                <tr className="bg-muted/10">
                  <td className="px-3 py-2 text-muted-foreground align-top">Volume organisation</td>
                  <td className="px-3 py-2 text-right align-top">
                    <div className="tabular-nums text-muted-foreground">{formatVolume(result.currentOrgVolume)}</div>
                    <div className="text-[11px] text-muted-foreground/70">
                      dont {formatVolume(currentPersonalVolume)} perso
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right align-top font-medium border-l border-border/50">
                    <div className="tabular-nums">
                      {formatVolume(result.targetOrgVolume)}
                      <DeltaBadge value={formatVolumeDelta(result.currentOrgVolume, result.targetOrgVolume)} />
                    </div>
                    <VolumeProgressGauge
                      current={isTrackingCurrentExercice ? result.currentOrgVolume : 0}
                      target={result.targetOrgVolume}
                    />
                    <div className="text-[11px] font-normal text-muted-foreground/70">
                      dont {formatVolume(targetPersonalVolume)} perso
                    </div>
                    <VolumeProgressGauge
                      current={isTrackingCurrentExercice ? currentPersonalVolume : 0}
                      target={targetPersonalVolume}
                    />
                  </td>
                  <td className="px-3 py-2 text-right align-top text-muted-foreground border-l border-border/50">
                    <div className="tabular-nums">
                      {formatVolume(groupResult.targetOrgVolume)}
                      <DeltaBadge value={formatVolumeDelta(result.currentOrgVolume, groupResult.targetOrgVolume)} />
                    </div>
                    <VolumeProgressGauge
                      current={isTrackingCurrentExercice ? result.currentOrgVolume : 0}
                      target={groupResult.targetOrgVolume}
                    />
                    <div className="text-[11px] text-muted-foreground/70">
                      dont {formatVolume(targetPersonalVolume)} perso
                    </div>
                    <VolumeProgressGauge
                      current={isTrackingCurrentExercice ? currentPersonalVolume : 0}
                      target={targetPersonalVolume}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2 pt-1 border-t border-border/50">
            <p className="text-xs font-medium text-foreground">Projection sur 5 ans</p>
            <OrganisationGrowthProjectionPanel
              exerciceLabel={exerciceLabel}
              currentConsultantCount={currentConsultantCount ?? 0}
              input={{
                attritionPercent,
                targetGrowthPercent,
                targetSponsorsRatePercent,
                targetPersonalVolume,
                targetTeamAverageVolume,
                targetTeamActiveRatePercent,
                jdPresenceToRecruitRatePercent,
                jdConfirmationToPresenceRatePercent,
              }}
            />
          </div>

          <ul className="space-y-1 text-[11px] text-muted-foreground list-disc pl-4 marker:text-muted-foreground/50">
            <li>La croissance ne s'applique qu'à l'effectif ; les autres lignes = effectif visé × taux de la ligne.</li>
            <li>Groupe = mêmes croissance/attrition/volume perso que Objectif ; seuls taux et volume équipe passent en référence nationale.</li>
            <li>« Actifs organisation » affiche le chiffre décimal exact (arrondi indiqué en dessous) pour que le volume se vérifie à la main.</li>
            <li>L'attrition visée porte sur le parrainage brut (existants + recrues), pas sur l'effectif/volume final.</li>
            <li>Funnel JD : pas de référence nationale, taux de transformation à ajuster à votre expérience terrain.</li>
            <li>
              Les compteurs (+/−) sous « Parrainages », « Présents JD » et « Oui, je viens » suivent votre
              progression réelle pour l'exercice choisi ci-dessus — indépendant de l'exercice affiché dans le
              reste du tableau (le funnel se travaille en amont, souvent pour l'exercice suivant).
            </li>
            {!isTrackingCurrentExercice && (
              <li>
                Les jauges de volume repartent de 0 : l'exercice {jdFunnelTracker.exerciceLabel} suivi
                ci-dessus n'a pas encore démarré, il n'a donc pas encore de volume réel.
              </li>
            )}
          </ul>
        </div>
      )}
    </StatistiquesPanel>
  );
}
