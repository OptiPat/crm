import { useCallback, useEffect, useState } from "react";
import { getContactById } from "@/lib/api/tauri-contacts";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import {
  contactAddressFromContact,
  formatContactAddressForCalendar,
  persistRdvContactAddress,
  validatePresentielAddress,
} from "@/lib/calendar/rdv-contact-address";
import type { ContactAddressFields } from "@/lib/contacts/contact-form-utils";
import type { RdvVisioMode, RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import { defaultRdvVisioFromCgp } from "@/lib/calendar/rdv-visio";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";

export function useRdvVisioLocation(contactId: number | undefined, enabled = true) {
  const [visioMode, setVisioMode] = useState<RdvVisioMode>("google_meet");
  const [visioLink, setVisioLink] = useState("");
  const [address, setAddress] = useState<ContactAddressFields>({
    adresse: "",
    code_postal: "",
    ville: "",
    pays: "",
  });

  const loadContactAddress = useCallback(async () => {
    if (!enabled || !contactId || contactId <= 0) return;
    const contact = await getContactById(contactId);
    setAddress(contactAddressFromContact(contact));
  }, [contactId, enabled]);

  const loadVisioDefaults = useCallback(async () => {
    if (!enabled) return;
    const cgp = await getCgpConfig();
    const visioDefault = defaultRdvVisioFromCgp(cgp);
    setVisioMode(visioDefault.mode);
    setVisioLink(visioDefault.customLink);
  }, [enabled]);

  const reset = useCallback(async () => {
    await Promise.all([loadVisioDefaults(), loadContactAddress()]);
  }, [loadContactAddress, loadVisioDefaults]);

  useEffect(() => {
    if (!enabled) return;
    void reset();
  }, [enabled, reset]);

  useEffect(() => {
    if (!enabled || !contactId) return;
    return subscribeContactsChanged(() => {
      void loadContactAddress();
    });
  }, [contactId, enabled, loadContactAddress]);

  const setAddressField = <K extends keyof ContactAddressFields>(key: K, value: string) => {
    setAddress((prev) => ({ ...prev, [key]: value }));
  };

  const getVisioOptions = (): RdvVisioOptions => ({
    mode: visioMode,
    customLink: visioLink,
  });

  const getPhysicalAddress = (): string | null => formatContactAddressForCalendar(address);

  const validate = (): string | null => {
    if (visioMode === "custom" && !visioLink.trim()) {
      return "Indiquez votre lien Zoom ou Teams (ou enregistrez-le dans Paramètres).";
    }
    if (visioMode === "none") {
      return validatePresentielAddress(address);
    }
    return null;
  };

  const persistContactAddress = async (): Promise<void> => {
    if (!contactId || contactId <= 0) return;
    await persistRdvContactAddress(contactId, address);
  };

  return {
    visioMode,
    setVisioMode,
    visioLink,
    setVisioLink,
    address,
    setAddressField,
    getVisioOptions,
    getPhysicalAddress,
    validate,
    persistContactAddress,
    reset,
  };
}
