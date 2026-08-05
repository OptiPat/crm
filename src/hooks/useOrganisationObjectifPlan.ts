import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  currentFiscalYearLabel,
  listSelectableFiscalYearLabels,
  nextFiscalYearLabel,
} from "@/lib/pipe/remuneration-fiscal-year";
import type { YearlyGrowthLevers } from "@/lib/statistiques/organisation-growth-projection";
import type { JdFunnelCounts } from "@/lib/statistiques/organisation-jd-funnel-tracker";
import {
  emptyJdFunnelTrackerState,
  getJdFunnelCountsForExercice,
  jdFunnelTrackerStatesEqual,
  loadJdFunnelTrackerState,
  saveJdFunnelTrackerState,
  setJdFunnelCountsForExercice,
  setJdFunnelTrackedExerciceLabel,
  type JdFunnelTrackerState,
} from "@/lib/statistiques/organisation-jd-funnel-tracker-storage";
import {
  emptyOrganisationObjectifPlan,
  loadOrganisationObjectifPlan,
  mergeOrganisationObjectifTablePrefs,
  saveOrganisationObjectifPlan,
  type OrganisationObjectifPlan,
  type OrganisationObjectifTablePrefs,
} from "@/lib/statistiques/organisation-objectif-plan-storage";

export type OrganisationObjectifPlanSaveStatus =
  | "loading"
  | "dirty"
  | "saving"
  | "saved"
  | "save_error";

function clonePlan(plan: OrganisationObjectifPlan): OrganisationObjectifPlan {
  return {
    tablePrefs: { ...plan.tablePrefs },
    projectionOverridesByYear: { ...plan.projectionOverridesByYear },
    savedAt: plan.savedAt,
  };
}

function cloneFunnelState(state: JdFunnelTrackerState): JdFunnelTrackerState {
  return {
    trackedExerciceLabel: state.trackedExerciceLabel,
    countsByExercice: { ...state.countsByExercice },
    savedAt: state.savedAt,
  };
}

function plansEqual(a: OrganisationObjectifPlan, b: OrganisationObjectifPlan): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function resolveDefaultTrackedExerciceLabel(): string {
  return nextFiscalYearLabel(currentFiscalYearLabel()) ?? currentFiscalYearLabel();
}

export function useOrganisationObjectifPlan(exerciceLabel: string) {
  const [plan, setPlan] = useState<OrganisationObjectifPlan | null>(null);
  const [funnelState, setFunnelState] = useState<JdFunnelTrackerState | null>(null);
  const [saveStatus, setSaveStatus] = useState<OrganisationObjectifPlanSaveStatus>("loading");
  const [loadError, setLoadError] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const planRef = useRef<OrganisationObjectifPlan | null>(null);
  const savedPlanRef = useRef<OrganisationObjectifPlan | null>(null);
  const funnelRef = useRef<JdFunnelTrackerState | null>(null);
  const savedFunnelRef = useRef<JdFunnelTrackerState | null>(null);
  const exerciceRef = useRef(exerciceLabel);
  const draftByExerciceRef = useRef<Map<string, OrganisationObjectifPlan>>(new Map());
  const funnelDraftRef = useRef<JdFunnelTrackerState | null>(null);

  const jdFunnelExerciceOptions = useMemo(() => {
    const current = currentFiscalYearLabel();
    return listSelectableFiscalYearLabels().filter((label) => label >= current);
  }, []);

  const defaultTrackedExerciceLabel = useMemo(() => resolveDefaultTrackedExerciceLabel(), []);

  const syncSaveStatus = useCallback(() => {
    const planBaseline = savedPlanRef.current;
    const funnelBaseline = savedFunnelRef.current;
    const planDirty =
      planRef.current != null &&
      planBaseline != null &&
      !plansEqual(planRef.current, planBaseline);
    const funnelDirty =
      funnelRef.current != null &&
      funnelBaseline != null &&
      !jdFunnelTrackerStatesEqual(funnelRef.current, funnelBaseline);
    setSaveStatus(planDirty || funnelDirty ? "dirty" : "saved");
  }, []);

  const markPlanDirtyIfChanged = useCallback(
    (next: OrganisationObjectifPlan) => {
      planRef.current = next;
      setPlan(next);
      syncSaveStatus();
    },
    [syncSaveStatus]
  );

  const markFunnelDirtyIfChanged = useCallback(
    (next: JdFunnelTrackerState) => {
      funnelRef.current = next;
      setFunnelState(next);
      funnelDraftRef.current = cloneFunnelState(next);
      syncSaveStatus();
    },
    [syncSaveStatus]
  );

  const applyPlanDraft = useCallback(
    (next: OrganisationObjectifPlan) => {
      if (loadError) return;
      markPlanDirtyIfChanged(next);
      draftByExerciceRef.current.set(exerciceRef.current, clonePlan(next));
    },
    [loadError, markPlanDirtyIfChanged]
  );

  const savePlan = useCallback(async () => {
    if (loadError || planRef.current == null || funnelRef.current == null) return;
    const label = exerciceRef.current;
    const planSnapshot: OrganisationObjectifPlan = {
      ...clonePlan(planRef.current),
      savedAt: Date.now(),
    };
    const funnelSnapshot: JdFunnelTrackerState = {
      ...cloneFunnelState(funnelRef.current),
      savedAt: Date.now(),
    };
    setSaveStatus("saving");
    try {
      await Promise.all([
        saveOrganisationObjectifPlan(label, planSnapshot),
        saveJdFunnelTrackerState(funnelSnapshot),
      ]);
      if (exerciceRef.current !== label) return;
      savedPlanRef.current = planSnapshot;
      savedFunnelRef.current = funnelSnapshot;
      planRef.current = planSnapshot;
      funnelRef.current = funnelSnapshot;
      setPlan(planSnapshot);
      setFunnelState(funnelSnapshot);
      setSavedAt(planSnapshot.savedAt);
      draftByExerciceRef.current.delete(label);
      funnelDraftRef.current = null;
      setSaveStatus("saved");
    } catch {
      if (exerciceRef.current === label) {
        setSaveStatus("save_error");
      }
    }
  }, [loadError]);

  useEffect(() => {
    exerciceRef.current = exerciceLabel;
    let cancelled = false;

    setLoadError(false);
    setSaveStatus("loading");
    setPlan(null);
    planRef.current = null;
    savedPlanRef.current = null;
    setSavedAt(null);

    const cachedPlanDraft = draftByExerciceRef.current.get(exerciceLabel);
    const cachedFunnelDraft = funnelDraftRef.current;

    if (cachedPlanDraft) {
      const draft = clonePlan(cachedPlanDraft);
      planRef.current = draft;
      setPlan(draft);
    }

    if (cachedFunnelDraft) {
      const draft = cloneFunnelState(cachedFunnelDraft);
      funnelRef.current = draft;
      setFunnelState(draft);
    }

    void Promise.all([
      cachedPlanDraft ? Promise.resolve(cachedPlanDraft) : loadOrganisationObjectifPlan(exerciceLabel),
      cachedFunnelDraft ? Promise.resolve(cachedFunnelDraft) : loadJdFunnelTrackerState(),
    ])
      .then(([loadedPlan, loadedFunnel]) => {
        if (cancelled || exerciceRef.current !== exerciceLabel) return;

        const planSnapshot = clonePlan(cachedPlanDraft ?? loadedPlan);
        const funnelSnapshot = cloneFunnelState(cachedFunnelDraft ?? loadedFunnel);

        if (!cachedPlanDraft) {
          savedPlanRef.current = planSnapshot;
          planRef.current = planSnapshot;
          setPlan(planSnapshot);
          setSavedAt(planSnapshot.savedAt);
        }

        if (!cachedFunnelDraft) {
          savedFunnelRef.current = funnelSnapshot;
          funnelRef.current = funnelSnapshot;
          setFunnelState(funnelSnapshot);
        }

        const planDirty =
          cachedPlanDraft != null ||
          (savedPlanRef.current != null && !plansEqual(planRef.current!, savedPlanRef.current));
        const funnelDirty =
          cachedFunnelDraft != null ||
          (savedFunnelRef.current != null &&
            !jdFunnelTrackerStatesEqual(funnelRef.current, savedFunnelRef.current));
        setSaveStatus(planDirty || funnelDirty ? "dirty" : "saved");
      })
      .catch(() => {
        if (!cancelled && exerciceRef.current === exerciceLabel) {
          planRef.current = null;
          savedPlanRef.current = null;
          funnelRef.current = null;
          savedFunnelRef.current = null;
          setPlan(null);
          setFunnelState(null);
          setLoadError(true);
          setSaveStatus("saved");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [exerciceLabel]);

  const updateTablePrefs = useCallback(
    (update: Partial<Record<keyof OrganisationObjectifTablePrefs, number | undefined>>) => {
      const current = planRef.current ?? emptyOrganisationObjectifPlan();
      applyPlanDraft({
        ...current,
        tablePrefs: mergeOrganisationObjectifTablePrefs(current.tablePrefs, update),
      });
    },
    [applyPlanDraft]
  );

  const updateProjectionYearOverride = useCallback(
    (year: number, override: Partial<YearlyGrowthLevers>) => {
      const current = planRef.current ?? emptyOrganisationObjectifPlan();
      const projectionOverridesByYear = { ...current.projectionOverridesByYear };
      if (Object.keys(override).length === 0) {
        delete projectionOverridesByYear[year];
      } else {
        projectionOverridesByYear[year] = override;
      }
      applyPlanDraft({
        ...current,
        projectionOverridesByYear,
      });
    },
    [applyPlanDraft]
  );

  const setProjectionYearOverrideField = useCallback(
    (year: number, key: keyof YearlyGrowthLevers, value: number | undefined) => {
      const current = planRef.current ?? emptyOrganisationObjectifPlan();
      const nextYearOverride = { ...(current.projectionOverridesByYear[year] ?? {}) };
      if (value === undefined) {
        delete nextYearOverride[key];
      } else {
        nextYearOverride[key] = value;
      }
      updateProjectionYearOverride(year, nextYearOverride);
    },
    [updateProjectionYearOverride]
  );

  const resetProjectionYear = useCallback(
    (year: number) => {
      updateProjectionYearOverride(year, {});
    },
    [updateProjectionYearOverride]
  );

  const jdFunnelTrackedExerciceLabel =
    funnelState?.trackedExerciceLabel ?? defaultTrackedExerciceLabel;

  const jdFunnelCounts = getJdFunnelCountsForExercice(
    funnelState ?? emptyJdFunnelTrackerState(),
    jdFunnelTrackedExerciceLabel
  );

  const setJdFunnelTrackedExerciceLabelState = useCallback(
    (value: string) => {
      const current = funnelRef.current ?? emptyJdFunnelTrackerState();
      markFunnelDirtyIfChanged(setJdFunnelTrackedExerciceLabel(current, value));
    },
    [markFunnelDirtyIfChanged]
  );

  const setJdFunnelStageCount = useCallback(
    (stage: keyof JdFunnelCounts, value: number) => {
      const current = funnelRef.current ?? emptyJdFunnelTrackerState();
      const trackedLabel = current.trackedExerciceLabel ?? defaultTrackedExerciceLabel;
      const nextCounts = {
        ...getJdFunnelCountsForExercice(current, trackedLabel),
        [stage]: value,
      };
      markFunnelDirtyIfChanged(
        setJdFunnelCountsForExercice(setJdFunnelTrackedExerciceLabel(current, trackedLabel), trackedLabel, nextCounts)
      );
    },
    [defaultTrackedExerciceLabel, markFunnelDirtyIfChanged]
  );

  const isDirty = saveStatus === "dirty" || saveStatus === "save_error";

  return {
    plan,
    isLoading: saveStatus === "loading",
    loadError,
    saveStatus,
    isDirty,
    savedAt,
    tablePrefs: plan?.tablePrefs ?? {},
    projectionOverridesByYear: plan?.projectionOverridesByYear ?? {},
    updateTablePrefs,
    setProjectionYearOverrideField,
    resetProjectionYear,
    savePlan,
    jdFunnelExerciceOptions,
    jdFunnelTrackedExerciceLabel,
    jdFunnelCounts,
    setJdFunnelTrackedExerciceLabel: setJdFunnelTrackedExerciceLabelState,
    setJdFunnelStageCount,
  };
}
