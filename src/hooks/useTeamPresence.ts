import { useCallback, useEffect, useMemo, useState } from "react";
import { getMicrosoftTeamConnectionStatus } from "@/lib/api/tauri-team";
import {
  teamListPresence,
  teamPresenceHeartbeat,
  type TeamPresenceEntry,
} from "@/lib/api/tauri-team-collaboration";
import {
  filterOtherPresence,
  formatPresenceBanner,
  TEAM_PRESENCE_HEARTBEAT_MS,
  TEAM_PRESENCE_POLL_MS,
} from "@/lib/team/team-collaboration-logic";

export function useTeamPresence(options: {
  enabled: boolean;
  entityType: string;
  entityId: string | number | null | undefined;
}) {
  const [selfActorId, setSelfActorId] = useState<string | null>(null);
  const [others, setOthers] = useState<TeamPresenceEntry[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entityId = options.entityId != null ? String(options.entityId) : null;
  const active =
    options.enabled && Boolean(entityId) && options.entityType.trim().length > 0;

  const refreshPresence = useCallback(async () => {
    if (!active || !entityId) return;
    try {
      const entries = await teamListPresence({
        entityType: options.entityType,
        entityId,
      });
      const filtered = filterOtherPresence(entries, selfActorId);
      setOthers(filtered);
      setBanner(formatPresenceBanner(filtered));
      setError(null);
    } catch (cause) {
      console.error("Présence équipe indisponible:", cause);
      setError("Présence équipe indisponible");
    }
  }, [active, entityId, options.entityType, selfActorId]);

  const sendHeartbeat = useCallback(async () => {
    if (!active || !entityId) return;
    try {
      await teamPresenceHeartbeat({
        entityType: options.entityType,
        entityId,
      });
      setError(null);
    } catch (cause) {
      console.error("Heartbeat présence équipe:", cause);
    }
  }, [active, entityId, options.entityType]);

  useEffect(() => {
    if (!active) {
      setOthers([]);
      setBanner(null);
      setError(null);
      return;
    }
    void getMicrosoftTeamConnectionStatus()
      .then((status) => setSelfActorId(status.email?.trim().toLowerCase() ?? null))
      .catch(() => setSelfActorId(null));
  }, [active]);

  useEffect(() => {
    if (!active) return;
    void sendHeartbeat();
    void refreshPresence();
    const heartbeatId = window.setInterval(() => {
      void sendHeartbeat();
    }, TEAM_PRESENCE_HEARTBEAT_MS);
    const pollId = window.setInterval(() => {
      void refreshPresence();
    }, TEAM_PRESENCE_POLL_MS);
    return () => {
      window.clearInterval(heartbeatId);
      window.clearInterval(pollId);
    };
  }, [active, refreshPresence, sendHeartbeat]);

  return useMemo(
    () => ({
      others,
      banner,
      error,
      refreshPresence,
    }),
    [banner, error, others, refreshPresence]
  );
}
