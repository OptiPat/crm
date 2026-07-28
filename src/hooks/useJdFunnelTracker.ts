import { useEffect, useMemo, useState } from "react";
import {
  currentFiscalYearLabel,
  listSelectableFiscalYearLabels,
  nextFiscalYearLabel,
} from "@/lib/pipe/remuneration-fiscal-year";
import {
  loadJdFunnelCounts,
  loadJdFunnelTrackerExerciceLabel,
  saveJdFunnelCounts,
  saveJdFunnelTrackerExerciceLabel,
  type JdFunnelCounts,
} from "@/lib/statistiques/organisation-jd-funnel-tracker";

/**
 * État + persistance du suivi terrain manuel du funnel JD (panneau Organisation). L'exercice suivi
 * est choisi par l'utilisateur (souvent l'exercice SUIVANT : le funnel se travaille en amont,
 * pendant l'exercice courant, pour alimenter les inscriptions de l'exercice suivant).
 */
export function useJdFunnelTracker() {
  // Seulement l'exercice courant et les suivants — le funnel se travaille en amont, pas de sens de
  // suivre un exercice déjà clos. Comparaison de chaînes valide car format « YYYY-YYYY » à largeur fixe.
  const exerciceOptions = useMemo(() => {
    const current = currentFiscalYearLabel();
    return listSelectableFiscalYearLabels().filter((label) => label >= current);
  }, []);
  const defaultExerciceLabel = useMemo(
    () => nextFiscalYearLabel(currentFiscalYearLabel()) ?? currentFiscalYearLabel(),
    []
  );

  const [exerciceLabel, setExerciceLabelState] = useState(
    () => loadJdFunnelTrackerExerciceLabel() ?? defaultExerciceLabel
  );
  const [counts, setCounts] = useState<JdFunnelCounts>(() => loadJdFunnelCounts(exerciceLabel));

  useEffect(() => {
    setCounts(loadJdFunnelCounts(exerciceLabel));
  }, [exerciceLabel]);

  function setExerciceLabel(value: string) {
    setExerciceLabelState(value);
    saveJdFunnelTrackerExerciceLabel(value);
  }

  function setStageCount(stage: keyof JdFunnelCounts, value: number) {
    const next = { ...counts, [stage]: value };
    setCounts(next);
    saveJdFunnelCounts(exerciceLabel, next);
  }

  return { exerciceLabel, setExerciceLabel, exerciceOptions, counts, setStageCount };
}
