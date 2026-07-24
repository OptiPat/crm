import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  teamAcquireLock,
  teamReleaseLock,
  teamRenewLock,
  type TeamLockRecord,
} from "@/lib/api/tauri-team-collaboration";
import { TEAM_LOCK_RENEW_MS } from "@/lib/team/team-collaboration-logic";

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
  const [lost, setLost] = useState(false);
  const lockRef = useRef<TeamLockRecord | null>(null);
  const releasePromiseRef = useRef<Promise<void> | null>(null);
  lockRef.current = lock;
  const entityId = options.entityId != null ? String(options.entityId) : null;
  const active =
    options.enabled && Boolean(entityId) && options.entityType.trim().length > 0;

  const releaseBestEffort = useCallback(async () => {
    if (!active || !entityId || !lockRef.current) return;
    lockRef.current = null;
    setLock(null);
    setHeldBy(null);
    setLost(false);
    const release = teamReleaseLock({
      entityType: options.entityType,
      entityId,
    })
      .catch((cause) => {
        console.warn("Libération verrou équipe (best effort):", cause);
      })
      .finally(() => {
        if (releasePromiseRef.current === release) {
          releasePromiseRef.current = null;
        }
      });
    releasePromiseRef.current = release;
    await release;
  }, [active, entityId, options.entityType]);

  const acquire = useCallback(async (): Promise<boolean> => {
    if (!active || !entityId) return true;
    if (releasePromiseRef.current) {
      await releasePromiseRef.current;
    }
    setLoading(true);
    try {
      const response = await teamAcquireLock({
        entityType: options.entityType,
        entityId,
      });
      if (response.acquired && response.lock) {
        lockRef.current = response.lock;
        setLock(response.lock);
        setHeldBy(null);
        setLost(false);
        setError(null);
        return true;
      }
      lockRef.current = null;
      setLock(null);
      setHeldBy(response.heldBy);
      setLost(false);
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
    let cancelled = false;
    const renewId = window.setInterval(() => {
      const current = lockRef.current;
      if (!current) return;
      void teamRenewLock({
        entityType: options.entityType,
        entityId: entityId!,
        etag: current.etag,
      })
        .then((response) => {
          if (cancelled) return;
          if (response.acquired && response.lock) {
            lockRef.current = response.lock;
            setLock(response.lock);
            setHeldBy(null);
            setLost(false);
            setError(null);
            return;
          }
          lockRef.current = null;
          setLock(null);
          setHeldBy(response.heldBy);
          setLost(true);
          setError(
            response.heldBy
              ? `Verrou repris par ${response.heldBy}`
              : "Verrou d'édition perdu à la suite d'un conflit SharePoint"
          );
        })
        .catch((cause) => {
          if (cancelled) return;
          console.warn("Renouvellement verrou équipe:", cause);
          lockRef.current = null;
          setLock(null);
          setHeldBy(null);
          setLost(true);
          setError("Connexion SharePoint perdue : édition interrompue");
        });
    }, TEAM_LOCK_RENEW_MS);

    return () => {
      cancelled = true;
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
      lost,
      readOnly: Boolean(heldBy) || lost,
      acquire,
      release: releaseBestEffort,
    }),
    [acquire, error, heldBy, loading, lock, lost, releaseBestEffort]
  );
}
