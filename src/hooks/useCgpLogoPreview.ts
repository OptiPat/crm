import { useEffect, useState } from "react";
import { loadCgpLogoDataUrl } from "@/lib/settings/cgp-logo-preview";

/** Aperçu du logo cabinet (data URL) à partir du chemin persisté en base. */
export function useCgpLogoPreview(logoPath: string | null | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadCgpLogoDataUrl(logoPath).then((url) => {
      if (!cancelled) {
        setSrc(url);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [logoPath]);

  return { src, loading };
}
