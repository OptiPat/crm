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
  getWorkspaceConfig,
  notifySharedCrmDataChanged,
  syncTeamWorkspaceOnce,
  TEAM_WORKSPACE_CHANGED_EVENT,
  type WorkspaceConfig,
  type WorkspaceConfigResponse,
} from "@/lib/api/tauri-team";
import {
  DEFAULT_WORKSPACE_CONFIG,
  resolveTeamCapabilities,
  type TeamCapabilities,
} from "@/lib/team/team-capabilities";

type TeamWorkspaceContextValue = {
  config: WorkspaceConfig;
  capabilities: TeamCapabilities;
  teamConfigured: boolean;
  authorityError: string | null;
  syncActivated: boolean;
  syncError: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const TeamWorkspaceContext = createContext<TeamWorkspaceContextValue | null>(null);
const FAIL_CLOSED_CAPABILITIES: TeamCapabilities = {
  canExport: false,
  canManageMembers: false,
  canUsePersonalMailbox: false,
};

export function TeamWorkspaceProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<WorkspaceConfigResponse>({
    config: DEFAULT_WORKSPACE_CONFIG,
    capabilities: enabled
      ? FAIL_CLOSED_CAPABILITIES
      : resolveTeamCapabilities(DEFAULT_WORKSPACE_CONFIG),
    teamConfigured: false,
    effectiveRole: "advisor",
    identityEmail: null,
    identityDisplayName: null,
    authorityError: null,
    syncActivated: false,
  });
  const [loading, setLoading] = useState(enabled);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncInFlight = useRef(false);

  const loadWorkspaceState = useCallback(async () => {
    if (!enabled) {
      setState({
        config: DEFAULT_WORKSPACE_CONFIG,
        capabilities: resolveTeamCapabilities(DEFAULT_WORKSPACE_CONFIG),
        teamConfigured: false,
        effectiveRole: "advisor",
        identityEmail: null,
        identityDisplayName: null,
        authorityError: null,
        syncActivated: false,
      });
      return;
    }
    try {
      const next = await getWorkspaceConfig();
      setState(next);
    } catch (error) {
      console.error("Configuration workspace inaccessible:", error);
      setState((previous) => ({
        ...previous,
        capabilities: FAIL_CLOSED_CAPABILITIES,
        authorityError: "Identité d’équipe non vérifiée. Les actions sensibles sont bloquées.",
      }));
    }
  }, [enabled]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadWorkspaceState();
    } finally {
      setLoading(false);
    }
  }, [loadWorkspaceState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onChanged = () => {
      void refresh();
    };
    window.addEventListener(TEAM_WORKSPACE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(TEAM_WORKSPACE_CHANGED_EVENT, onChanged);
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !state.syncActivated) return;
    let cancelled = false;
    const synchronize = async () => {
      if (cancelled || syncInFlight.current) return;
      syncInFlight.current = true;
      try {
        const report = await syncTeamWorkspaceOnce();
        if (cancelled) return;
        setSyncError(
          report.conflicts > 0
            ? `${report.conflicts} conflit(s) de synchronisation à résoudre.`
            : null
        );
        if (report.pulled > 0) {
          notifySharedCrmDataChanged();
        }
      } catch (error) {
        if (!cancelled) {
          setSyncError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          await loadWorkspaceState();
        }
        syncInFlight.current = false;
      }
    };
    const onWake = () => void synchronize();
    void synchronize();
    const interval = window.setInterval(onWake, 10_000);
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [enabled, loadWorkspaceState, state.syncActivated]);

  const value = useMemo<TeamWorkspaceContextValue>(
    () => ({
      config: state.config,
      capabilities: state.capabilities,
      teamConfigured: state.teamConfigured,
      authorityError: state.authorityError ?? null,
      syncActivated: state.syncActivated,
      syncError,
      loading,
      refresh,
    }),
    [loading, refresh, state, syncError]
  );

  return (
    <TeamWorkspaceContext.Provider value={value}>{children}</TeamWorkspaceContext.Provider>
  );
}

export function useTeamWorkspace(): TeamWorkspaceContextValue {
  const ctx = useContext(TeamWorkspaceContext);
  if (!ctx) {
    throw new Error("useTeamWorkspace doit être utilisé dans TeamWorkspaceProvider");
  }
  return ctx;
}

export function useCanExport(): boolean {
  return useTeamWorkspace().capabilities.canExport;
}
