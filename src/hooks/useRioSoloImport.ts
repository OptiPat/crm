import { useCallback } from "react";
import { toast } from "sonner";
import { applySoloRioImport } from "@/lib/contacts/rio-solo-apply";
import type { ExtractedData } from "@/lib/pdf";

export function useRioSoloImport(options: {
  effectiveContactId?: number;
  foyerId?: number;
  confirmIdentityMerge?: (message: string) => boolean | Promise<boolean>;
}) {
  const applySoloRioData = useCallback(
    async (data: ExtractedData, importOptions?: { deferFinancialFields?: boolean }) => {
      return applySoloRioImport(
        data,
        {
          effectiveContactId: options.effectiveContactId,
          foyerId: options.foyerId,
          onMissingIdentity: (message) => toast.error(message),
          confirmIdentityMerge:
            options.confirmIdentityMerge ?? ((message) => window.confirm(message)),
        },
        importOptions
      );
    },
    [options.effectiveContactId, options.foyerId, options.confirmIdentityMerge]
  );

  return { applySoloRioData };
}
