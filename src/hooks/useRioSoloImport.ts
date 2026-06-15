import { useCallback } from "react";
import { toast } from "sonner";
import { applySoloRioImport } from "@/lib/contacts/rio-solo-apply";
import type { ExtractedData } from "@/lib/pdf";

export function useRioSoloImport(options: {
  effectiveContactId?: number;
  foyerId?: number;
}) {
  const applySoloRioData = useCallback(
    async (data: ExtractedData) => {
      return applySoloRioImport(data, {
        effectiveContactId: options.effectiveContactId,
        foyerId: options.foyerId,
        onMissingIdentity: (message) => toast.error(message),
        confirmIdentityMerge: (message) => window.confirm(message),
      });
    },
    [options.effectiveContactId, options.foyerId]
  );

  return { applySoloRioData };
}
