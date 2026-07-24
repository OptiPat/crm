import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTeamWorkspace } from "@/components/team/TeamWorkspaceProvider";
import { useRecordLock } from "@/hooks/useRecordLock";

export function useTeamFormRecordLock(options: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityId: string | number | null | undefined;
}) {
  const { teamConfigured, config } = useTeamWorkspace();
  const enabled = teamConfigured && Boolean(config.siteId?.trim());
  const lock = useRecordLock({
    enabled,
    entityType: options.entityType,
    entityId: options.entityId,
    editing: options.open && options.entityId != null,
  });
  const acquire = lock.acquire;
  const attemptRef = useRef<string | null>(null);
  const onOpenChangeRef = useRef(options.onOpenChange);
  const errorRef = useRef(lock.error);
  onOpenChangeRef.current = options.onOpenChange;
  errorRef.current = lock.error;

  useEffect(() => {
    const key =
      options.open && enabled && options.entityId != null
        ? `${options.entityType}:${options.entityId}`
        : null;
    if (!key) {
      attemptRef.current = null;
      return;
    }
    if (attemptRef.current === key) return;
    attemptRef.current = key;
    let cancelled = false;
    void acquire().then((acquired) => {
      if (cancelled || acquired) return;
      toast.error(errorRef.current ?? "Cet élément est déjà en cours de modification.");
      onOpenChangeRef.current(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    acquire,
    options.entityId,
    options.entityType,
    options.open,
  ]);

  useEffect(() => {
    if (!options.open || !lock.readOnly) return;
    toast.error(errorRef.current ?? "Le verrou d’édition a été perdu. Modifications annulées.");
    onOpenChangeRef.current(false);
  }, [lock.readOnly, options.open]);

  const required = enabled && options.open && options.entityId != null;
  return {
    ...lock,
    required,
    ready: !required || Boolean(lock.lock),
  };
}
