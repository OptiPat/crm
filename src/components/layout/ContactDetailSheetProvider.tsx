import { createContext, useContext, type ReactNode } from "react";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";
import type { ContactDetailTabHint } from "@/lib/investissements/investissement-navigation";

type ContactDetailSheetContextValue = {
  openContactSheet: DashboardDrillDownOpenContact;
  openContactWithTab: (
    contactId: number,
    tab?: ContactDetailTabHint,
    ids?: number[]
  ) => Promise<void>;
};

const ContactDetailSheetContext = createContext<ContactDetailSheetContextValue | null>(
  null
);

export function ContactDetailSheetProvider({
  onNavigate,
  children,
}: {
  onNavigate?: (page: string) => void;
  children: ReactNode;
}) {
  const { openContactSheet, openContactWithTab, sheet } = useContactDetailSheet({
    onNavigate,
  });

  return (
    <ContactDetailSheetContext.Provider value={{ openContactSheet, openContactWithTab }}>
      {children}
      {sheet}
    </ContactDetailSheetContext.Provider>
  );
}

export function useGlobalContactDetailSheet(): ContactDetailSheetContextValue {
  const ctx = useContext(ContactDetailSheetContext);
  if (!ctx) {
    throw new Error("useGlobalContactDetailSheet doit être utilisé dans ContactDetailSheetProvider");
  }
  return ctx;
}
