import { useEffect, useState } from "react";
import type { ClientPreviewViewport } from "./ClientPreviewAdvisorPanel";

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

function readAutoViewport(): ClientPreviewViewport {
  if (typeof window === "undefined") return "mobile";
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches ? "desktop" : "mobile";
}

/** Détection écran + bascule manuelle (portail client). */
export function useClientPreviewViewport() {
  const [autoViewport, setAutoViewport] =
    useState<ClientPreviewViewport>(readAutoViewport);
  const [override, setOverride] = useState<ClientPreviewViewport | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const sync = () => setAutoViewport(mq.matches ? "desktop" : "mobile");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return {
    viewport: override ?? autoViewport,
    setViewport: setOverride,
  };
}
