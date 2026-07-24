import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getWorkspaceConfig,
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
  });
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({
        config: DEFAULT_WORKSPACE_CONFIG,
        capabilities: resolveTeamCapabilities(DEFAULT_WORKSPACE_CONFIG),
        teamConfigured: false,
        effectiveRole: "advisor",
        identityEmail: null,
        identityDisplayName: null,
        authorityError: null,
      });
      setLoading(false);
      return;
    }
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [enabled]);

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

  const value = useMemo<TeamWorkspaceContextValue>(
    () => ({
      config: state.config,
      capabilities: state.capabilities,
      teamConfigured: state.teamConfigured,
      authorityError: state.authorityError ?? null,
      loading,
      refresh,
    }),
    [loading, refresh, state]
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
