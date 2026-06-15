import { useCallback } from "react";
import { toast } from "sonner";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  applyCoupleRioImport,
  type RioCoupleApplyResult,
} from "@/lib/contacts/rio-couple-apply";
import type { ExtractedData } from "@/lib/pdf";

export function useRioCoupleImport(options: {
  effectiveContactId?: number;
  foyerId?: number;
  formFoyerId?: number;
  importContacts: Contact[];
}) {
  const applyCoupleRioData = useCallback(
    async (data: ExtractedData): Promise<RioCoupleApplyResult | null> => {
      return applyCoupleRioImport(data, {
        effectiveContactId: options.effectiveContactId,
        explicitFoyerId: options.foyerId ?? options.formFoyerId,
        importContacts: options.importContacts,
        onMissingIdentity: (message) => toast.error(message),
        confirmIdentityMerge: (message) => window.confirm(message),
      });
    },
    [
      options.effectiveContactId,
      options.foyerId,
      options.formFoyerId,
      options.importContacts,
    ]
  );

  return { applyCoupleRioData };
}
