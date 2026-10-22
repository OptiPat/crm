import { useEffect, useRef } from "react";

/**
 * Pages avec une saisie non enregistrée : App demande confirmation avant de changer de page
 * (menu latéral, recherche globale, liens internes).
 */
type PageLeaveGuard = () => boolean;

const guards = new Set<PageLeaveGuard>();
let skipNextCheck = false;

export function registerPageLeaveGuard(guard: PageLeaveGuard): () => void {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

/** `true` si une page signale des modifications non enregistrées. */
export function hasUnsavedPageChanges(): boolean {
  if (skipNextCheck) {
    skipNextCheck = false;
    return false;
  }
  for (const guard of guards) {
    if (guard()) return true;
  }
  return false;
}

/**
 * La page a déjà confirmé l'abandon de sa saisie : la prochaine vérification (synchrone, dans la
 * même tâche) laisse passer la navigation sans redemander. Sans navigation, l'autorisation expire.
 */
export function allowNextPageLeave(): void {
  skipNextCheck = true;
  window.setTimeout(() => {
    skipNextCheck = false;
  }, 0);
}

/** Signale à App que la page a des modifications non enregistrées tant que `dirty` est vrai. */
export function usePageLeaveGuard(dirty: boolean): void {
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => registerPageLeaveGuard(() => dirtyRef.current), []);
}
