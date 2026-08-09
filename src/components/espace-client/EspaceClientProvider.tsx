import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSetting } from "@/lib/api/tauri-settings";
import {
  ESPACE_CLIENT_ACTIVE_SETTING,
  parseEspaceClientActive,
} from "@/lib/espace-client/espace-client-capabilities";

type EspaceClientContextValue = {
  active: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const EspaceClientContext = createContext<EspaceClientContextValue | null>(null);

export function EspaceClientProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setActive(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const value = await getSetting(ESPACE_CLIENT_ACTIVE_SETTING);
      setActive(parseEspaceClientActive(value));
    } catch {
      setActive(false);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ active, loading, refresh }),
    [active, loading, refresh]
  );

  return (
    <EspaceClientContext.Provider value={value}>
      {children}
    </EspaceClientContext.Provider>
  );
}

export function useEspaceClientActive(): boolean {
  const ctx = useContext(EspaceClientContext);
  return ctx?.active ?? false;
}

export function useEspaceClientContext(): EspaceClientContextValue {
  const ctx = useContext(EspaceClientContext);
  if (!ctx) {
    return {
      active: false,
      loading: false,
      refresh: async () => {},
    };
  }
  return ctx;
}
