import { useEffect, useRef } from "react";

/** Compteurs invalidés au changement d'affaire / contacts (liaisons et reload documents). */
export function usePipeChecklistHookSession(
  pipeId: number,
  contactId: number,
  secondaryContactId: number | null | undefined
) {
  const activePipeIdRef = useRef(pipeId);
  const sessionGenerationRef = useRef(0);
  const persistGenerationRef = useRef(0);
  const linkGenerationRef = useRef(0);

  useEffect(() => {
    activePipeIdRef.current = pipeId;
    sessionGenerationRef.current++;
    persistGenerationRef.current++;
    linkGenerationRef.current++;
  }, [contactId, pipeId, secondaryContactId]);

  return {
    activePipeIdRef,
    sessionGenerationRef,
    persistGenerationRef,
    linkGenerationRef,
  };
}
