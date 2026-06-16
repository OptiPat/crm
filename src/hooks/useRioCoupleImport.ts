import { useCallback } from "react";
import { toast } from "sonner";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  applyCoupleRioImport,
} from "@/lib/contacts/rio-couple-apply";
import type { ExtractedData } from "@/lib/pdf";

export function useRioCoupleImport(options: {
  effectiveContactId?: number;
  foyerId?: number;
  formFoyerId?: number;
  importContacts: Contact[];
}) {
  const applyCoupleRioData = useCallback(
    async (data: ExtractedData, importOptions?: { deferFinancialFields?: boolean }) => {
      return applyCoupleRioImport(
        data,
        {
          effectiveContactId: options.effectiveContactId,
          explicitFoyerId: options.foyerId ?? options.formFoyerId,
          importContacts: options.importContacts,
          onMissingIdentity: (message) => toast.error(message),
          confirmIdentityMerge: (message) => window.confirm(message),
        },
        importOptions
      );
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
