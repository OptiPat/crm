import { useCallback, useEffect, useRef, useState } from "react";
import type { YearlyGrowthLevers } from "@/lib/statistiques/organisation-growth-projection";
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

function plansEqual(a: OrganisationObjectifPlan, b: OrganisationObjectifPlan): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useOrganisationObjectifPlan(exerciceLabel: string) {
  const [plan, setPlan] = useState<OrganisationObjectifPlan | null>(null);
  const [saveStatus, setSaveStatus] = useState<OrganisationObjectifPlanSaveStatus>("loading");
  const [loadError, setLoadError] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const planRef = useRef<OrganisationObjectifPlan | null>(null);
  const savedPlanRef = useRef<OrganisationObjectifPlan | null>(null);
  const exerciceRef = useRef(exerciceLabel);
  const draftByExerciceRef = useRef<Map<string, OrganisationObjectifPlan>>(new Map());

  const markDirtyIfChanged = useCallback((next: OrganisationObjectifPlan) => {
    planRef.current = next;
    setPlan(next);
    const baseline = savedPlanRef.current;
    setSaveStatus(baseline != null && plansEqual(next, baseline) ? "saved" : "dirty");
  }, []);

  const applyDraft = useCallback(
    (next: OrganisationObjectifPlan) => {
      if (loadError) return;
      markDirtyIfChanged(next);
      draftByExerciceRef.current.set(exerciceRef.current, clonePlan(next));
    },
    [loadError, markDirtyIfChanged]
  );

  const savePlan = useCallback(async () => {
    if (loadError || planRef.current == null) return;
    const label = exerciceRef.current;
    const snapshot: OrganisationObjectifPlan = {
      ...clonePlan(planRef.current),
      savedAt: Date.now(),
    };
    setSaveStatus("saving");
    try {
      await saveOrganisationObjectifPlan(label, snapshot);
      if (exerciceRef.current !== label) return;
      savedPlanRef.current = snapshot;
      planRef.current = snapshot;
      setPlan(snapshot);
      setSavedAt(snapshot.savedAt);
      draftByExerciceRef.current.delete(label);
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

    const cachedDraft = draftByExerciceRef.current.get(exerciceLabel);
    if (cachedDraft) {
      const draft = clonePlan(cachedDraft);
      planRef.current = draft;
      setPlan(draft);
      setSaveStatus("dirty");
      return;
    }

    void loadOrganisationObjectifPlan(exerciceLabel)
      .then((loaded) => {
        if (cancelled || exerciceRef.current !== exerciceLabel) return;
        const snapshot = clonePlan(loaded);
        savedPlanRef.current = snapshot;
        planRef.current = snapshot;
        setPlan(snapshot);
        setSavedAt(snapshot.savedAt);
        setSaveStatus("saved");
      })
      .catch(() => {
        if (!cancelled && exerciceRef.current === exerciceLabel) {
          planRef.current = null;
          savedPlanRef.current = null;
          setPlan(null);
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
      applyDraft({
        ...current,
        tablePrefs: mergeOrganisationObjectifTablePrefs(current.tablePrefs, update),
      });
    },
    [applyDraft]
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
      applyDraft({
        ...current,
        projectionOverridesByYear,
      });
    },
    [applyDraft]
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
  };
}
