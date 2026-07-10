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



export type OpenContactWithTabOptions = {

  /** Fiche ouverte depuis un volet liste KPI — retour liste + pas de 2ᵉ overlay. */

  listBack?: boolean;

};



export function useContactDetailSheet(options: UseContactDetailSheetOptions = {}) {

  const { onNavigate, onUpdate, defaultTab } = options;

  const [contact, setContact] = useState<Contact | null>(null);

  const [open, setOpen] = useState(false);

  const [listBackMode, setListBackMode] = useState(false);

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



  const openContactSheet = useCallback<DashboardDrillDownOpenContact>(

    async (contactId) => {

      try {

        setListBackMode(false);

        await loadContact(contactId, { applyDefaultTab: true });

      } catch (error) {

        console.error("Erreur chargement contact:", error);

        toast.error("Impossible d'ouvrir le contact");

      }

    },

    [loadContact]

  );



  const openContactWithTab = useCallback(

    async (

      contactId: number,

      tab?: ContactDetailTabHint,

      openOptions: OpenContactWithTabOptions = {}

    ) => {

      try {

        setListBackMode(openOptions.listBack ?? false);

        await loadContact(contactId, { tab, applyDefaultTab: !tab });

      } catch (error) {

        console.error("Erreur chargement contact:", error);

        toast.error("Impossible d'ouvrir le contact");

      }

    },

    [loadContact]

  );



  const clearListBackMode = useCallback(() => {

    setListBackMode(false);

  }, []);



  const handleContactRefreshed = useCallback((next: Contact) => {
    setContact((prev) => (prev?.id === next.id ? next : prev));
  }, []);



  const closeContactDetail = useCallback(() => {

    setOpen(false);

    setContact(null);

  }, []);



  const handleOpenChange = useCallback(

    (nextOpen: boolean) => {

      if (!nextOpen) {

        closeContactDetail();

        return;

      }

      setOpen(true);

    },

    [closeContactDetail]

  );



  const handleDetailOpenChange = useCallback(

    (nextOpen: boolean) => {

      if (!nextOpen && listBackMode) {

        closeContactDetail();

        return;

      }

      handleOpenChange(nextOpen);

    },

    [listBackMode, closeContactDetail, handleOpenChange]

  );



  const sheet = (

    <DashboardContactDetailSheet

      open={open}

      onOpenChange={handleDetailOpenChange}

      contact={contact}

      onContactRefreshed={handleContactRefreshed}

      onNavigate={onNavigate}

      onUpdate={onUpdate}

      hideOverlay={listBackMode}

      onBackToList={listBackMode ? closeContactDetail : undefined}

      onOpenLinkedContact={(contactId) => void loadContact(contactId)}

    />

  );



  return {

    openContactSheet,

    openContactWithTab,

    clearListBackMode,

    closeContactDetail,

    refreshOpenContact: handleContactRefreshed,

    sheet,

    isOpen: open,

    activeContactId: contact?.id ?? null,

  };

}

