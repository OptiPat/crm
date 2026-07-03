import { useCallback, useRef, useState } from "react";
import { DashboardContactDetailSheet } from "@/components/dashboard/DashboardContactDetailSheet";
import { getContactById, type Contact } from "@/lib/api/tauri-contacts";
import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";
import {
  CRM_OPEN_CONTACT_TAB_KEY,
  type ContactDetailTabHint,
} from "@/lib/investissements/investissement-navigation";
import { toast } from "sonner";

type UseContactDetailSheetOptions = {
  onNavigate?: (page: string) => void;
  onUpdate?: () => void;
  defaultTab?: ContactDetailTabHint;
};

type LoadContactOptions = {
  tab?: ContactDetailTabHint;
  applyDefaultTab?: boolean;
};

export function useContactDetailSheet(options: UseContactDetailSheetOptions = {}) {
  const { onNavigate, onUpdate, defaultTab } = options;
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactIds, setContactIds] = useState<number[]>([]);
  const [open, setOpen] = useState(false);
  const loadSeqRef = useRef(0);

  const loadContact = useCallback(
    async (contactId: number, loadOptions: LoadContactOptions = {}) => {
      const seq = ++loadSeqRef.current;
      const tabHint =
        loadOptions.tab ??
        (loadOptions.applyDefaultTab !== false ? defaultTab : undefined);
      if (tabHint) {
        sessionStorage.setItem(CRM_OPEN_CONTACT_TAB_KEY, tabHint);
      }
      const loaded = await getContactById(contactId);
      if (seq !== loadSeqRef.current) return;
      setContact(loaded);
      setOpen(true);
    },
    [defaultTab]
  );

  const setContactIdsFromOpen = useCallback((ids?: number[]) => {
    setContactIds(ids?.length ? ids : []);
  }, []);

  const openContactSheet = useCallback<DashboardDrillDownOpenContact>(
    async (contactId, ids) => {
      try {
        setContactIdsFromOpen(ids);
        await loadContact(contactId, { applyDefaultTab: true });
      } catch (error) {
        console.error("Erreur chargement contact:", error);
        toast.error("Impossible d'ouvrir le contact");
      }
    },
    [loadContact, setContactIdsFromOpen]
  );

  const openContactWithTab = useCallback(
    async (contactId: number, tab?: ContactDetailTabHint, ids?: number[]) => {
      try {
        setContactIdsFromOpen(ids);
        await loadContact(contactId, { tab, applyDefaultTab: !tab });
      } catch (error) {
        console.error("Erreur chargement contact:", error);
        toast.error("Impossible d'ouvrir le contact");
      }
    },
    [loadContact, setContactIdsFromOpen]
  );

  const selectContact = useCallback(
    async (contactId: number) => {
      try {
        await loadContact(contactId, { applyDefaultTab: false });
      } catch (error) {
        console.error("Erreur chargement contact:", error);
        toast.error("Impossible d'ouvrir le contact");
      }
    },
    [loadContact]
  );

  const handleContactRefreshed = useCallback((next: Contact) => {
    setContact(next);
    setContactIds([]);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setContact(null);
      setContactIds([]);
    }
  }, []);

  const sheet = (
    <DashboardContactDetailSheet
      open={open}
      onOpenChange={handleOpenChange}
      contact={contact}
      contactIds={contactIds}
      onSelectContactId={selectContact}
      onContactRefreshed={handleContactRefreshed}
      onNavigate={onNavigate}
      onUpdate={onUpdate}
    />
  );

  return {
    openContactSheet,
    openContactWithTab,
    selectContact,
    sheet,
    isOpen: open,
    activeContactId: contact?.id ?? null,
  };
}
