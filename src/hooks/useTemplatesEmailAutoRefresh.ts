import { useEffect, useRef } from "react";
import { subscribeTemplatesEmailChanged } from "@/lib/emails/template-events";
import { subscribeEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";

const DEBOUNCE_MS = 120;

type TemplatesEmailAutoRefreshHandlers = {
  onTemplatesRefresh: () => void | Promise<void>;
  onEtiquetteLinksRefresh: () => void | Promise<void>;
};

/** Rafraîchissement page Templates : modifs modèles / liaisons étiquettes + retour fenêtre. */
export function useTemplatesEmailAutoRefresh(handlers: TemplatesEmailAutoRefreshHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const scheduleTemplates = () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void handlersRef.current.onTemplatesRefresh();
      }, DEBOUNCE_MS);
    };

    const scheduleLinks = () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void handlersRef.current.onEtiquetteLinksRefresh();
      }, DEBOUNCE_MS);
    };

    const unsubTemplates = subscribeTemplatesEmailChanged(scheduleTemplates);
    const unsubEtiquettes = subscribeEtiquettesChanged(scheduleLinks);

    const onWake = () => {
      if (document.hidden) return;
      void handlersRef.current.onTemplatesRefresh();
      void handlersRef.current.onEtiquetteLinksRefresh();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      unsubTemplates();
      unsubEtiquettes();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);
}
