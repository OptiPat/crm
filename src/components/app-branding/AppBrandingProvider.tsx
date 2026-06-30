import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  APP_BRANDING_CHANGED_EVENT,
  applyAppBrandingOs,
  getAppBranding,
  type AppBranding,
} from "@/lib/api/tauri-app-branding";
import {
  DEFAULT_APP_DISPLAY_NAME,
  DEFAULT_APP_LOGO_URL,
  resolveAppLogoSrc,
} from "@/lib/app-branding-resolve";

type AppBrandingContextValue = {
  displayName: string;
  logoSrc: string;
  logoMode: AppBranding["logoMode"];
  logoPath: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AppBrandingContext = createContext<AppBrandingContextValue | null>(null);

export function AppBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<AppBranding | null>(null);
  const [logoSrc, setLogoSrc] = useState(DEFAULT_APP_LOGO_URL);
  const [loading, setLoading] = useState(true);
  const osApplyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleOsBranding = useCallback(() => {
    if (osApplyTimer.current) {
      clearTimeout(osApplyTimer.current);
    }
    osApplyTimer.current = setTimeout(() => {
      osApplyTimer.current = null;
      void applyAppBrandingOs().catch((error) => {
        console.warn("Branding OS (icône / raccourci) :", error);
      });
    }, 300);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getAppBranding();
      setBranding(next);
      const src = await resolveAppLogoSrc(next.logoPath);
      setLogoSrc(src);
    } catch (error) {
      console.error("Erreur chargement branding:", error);
      setBranding(null);
      setLogoSrc(DEFAULT_APP_LOGO_URL);
    } finally {
      setLoading(false);
    }
    scheduleOsBranding();
  }, [scheduleOsBranding]);

  useEffect(() => {
    void refresh();
    return () => {
      if (osApplyTimer.current) {
        clearTimeout(osApplyTimer.current);
      }
    };
  }, [refresh]);

  useEffect(() => {
    const onChanged = () => {
      void refresh();
    };
    window.addEventListener(APP_BRANDING_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(APP_BRANDING_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const value = useMemo<AppBrandingContextValue>(
    () => ({
      displayName: branding?.displayName ?? DEFAULT_APP_DISPLAY_NAME,
      logoSrc,
      logoMode: branding?.logoMode ?? "default",
      logoPath: branding?.logoPath ?? null,
      loading,
      refresh,
    }),
    [branding, logoSrc, loading, refresh]
  );

  return <AppBrandingContext.Provider value={value}>{children}</AppBrandingContext.Provider>;
}

export function useAppBranding(): AppBrandingContextValue {
  const ctx = useContext(AppBrandingContext);
  if (!ctx) {
    throw new Error("useAppBranding doit être utilisé dans AppBrandingProvider");
  }
  return ctx;
}
