import { useEffect, useState } from "react";
import type { ClientPreviewViewport } from "./ClientPreviewAdvisorPanel";

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

function readAutoViewport(): ClientPreviewViewport {
  if (typeof window === "undefined") return "mobile";
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches ? "desktop" : "mobile";
}

/**
 * Détection de l'écran réel, pour le portail client.
 *
 * Pas de bascule manuelle ici : le navigateur du client sait sur quel appareil
 * il tourne. Le sélecteur Mobile/Ordinateur n'a de sens que dans l'aperçu du
 * CRM, où le conseiller veut voir depuis son bureau ce que verra un téléphone.
 */
export function useClientPreviewViewport() {
  const [viewport, setViewport] =
    useState<ClientPreviewViewport>(readAutoViewport);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const sync = () => setViewport(mq.matches ? "desktop" : "mobile");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return { viewport };
}
