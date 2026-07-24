import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  teamAcquireLock,
  teamReleaseLock,
  teamRenewLock,
  type TeamLockRecord,
} from "@/lib/api/tauri-team-collaboration";
import { mergeLockRenewEtag, TEAM_LOCK_RENEW_MS } from "@/lib/team/team-collaboration-logic";

export function useRecordLock(options: {
  enabled: boolean;
  entityType: string;
  entityId: string | number | null | undefined;
  /** Passe à true quand l'utilisateur entre en édition. */
  editing: boolean;
}) {
  const [lock, setLock] = useState<TeamLockRecord | null>(null);
  const [heldBy, setHeldBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lockRef = useRef<TeamLockRecord | null>(null);
  lockRef.current = lock;
  const entityId = options.entityId != null ? String(options.entityId) : null;
  const active =
    options.enabled && Boolean(entityId) && options.entityType.trim().length > 0;

  const releaseBestEffort = useCallback(async () => {
    if (!active || !entityId) return;
    try {
      await teamReleaseLock({
        entityType: options.entityType,
        entityId,
      });
    } catch (cause) {
      console.warn("Libération verrou équipe (best effort):", cause);
    } finally {
      setLock(null);
      setHeldBy(null);
    }
  }, [active, entityId, options.entityType]);

  const acquire = useCallback(async (): Promise<boolean> => {
    if (!active || !entityId) return true;
    setLoading(true);
    try {
      const response = await teamAcquireLock({
        entityType: options.entityType,
        entityId,
      });
      if (response.acquired && response.lock) {
        setLock(response.lock);
        setHeldBy(null);
        setError(null);
        return true;
      }
      setLock(null);
      setHeldBy(response.heldBy);
      setError(
        response.heldBy
          ? `Fiche verrouillée par ${response.heldBy}`
          : "Verrou collaboratif indisponible"
      );
      return false;
    } catch (cause) {
      console.error("Acquisition verrou équipe:", cause);
      setError("Verrou collaboratif indisponible");
      return false;
    } finally {
      setLoading(false);
    }
  }, [active, entityId, options.entityType]);

  useEffect(() => {
    if (!active || !options.editing) {
      void releaseBestEffort();
      return;
    }
    const renewId = window.setInterval(() => {
      const current = lockRef.current;
      if (!current) return;
      void teamRenewLock({
        entityType: options.entityType,
        entityId: entityId!,
        etag: current.etag,
      })
        .then((response) => {
          if (response.acquired && response.lock) {
            setLock(response.lock);
            setHeldBy(null);
            return;
          }
          if (response.heldBy) {
            setHeldBy(response.heldBy);
          }
          setLock((prev) => {
            if (!prev) return prev;
            const etag = mergeLockRenewEtag(prev.etag, response.lock?.etag);
            return etag ? { ...prev, etag } : prev;
          });
        })
        .catch((cause) => console.warn("Renouvellement verrou équipe:", cause));
    }, TEAM_LOCK_RENEW_MS);

    return () => {
      window.clearInterval(renewId);
      void releaseBestEffort();
    };
  }, [active, entityId, options.editing, options.entityType, releaseBestEffort]);

  return useMemo(
    () => ({
      lock,
      heldBy,
      loading,
      error,
      readOnly: Boolean(heldBy),
      acquire,
      release: releaseBestEffort,
    }),
    [acquire, error, heldBy, loading, lock, releaseBestEffort]
  );
}
