import { useEffect, useState } from "react";
import { getContactById, getContactsByFoyer } from "@/lib/api/tauri-contacts";
import { getFoyerById } from "@/lib/api/tauri-foyers";
import {
  buildSouscriptionHolderChoices,
  souscriptionHolderFoyerId,
  type SouscriptionHolderChoices,
} from "@/lib/placement/souscription-details";

/** Choix de titulaire d'une souscription affaire (contact principal, co-contact, foyer). */
export function useSouscriptionHolderChoices(
  contactId: number,
  secondaryContactId?: number | null,
  enabled = true
): SouscriptionHolderChoices | null {
  const [choices, setChoices] = useState<SouscriptionHolderChoices | null>(null);

  useEffect(() => {
    if (!enabled || contactId <= 0) {
      setChoices(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const primary = await getContactById(contactId);
        const secondary =
          secondaryContactId != null && secondaryContactId > 0
            ? await getContactById(secondaryContactId).catch(() => null)
            : null;
        const foyerId = souscriptionHolderFoyerId(primary, secondary);
        let foyer = null;
        if (foyerId) {
          const [foyerRow, members] = await Promise.all([
            getFoyerById(foyerId),
            getContactsByFoyer(foyerId),
          ]);
          foyer = { id: foyerRow.id, nom: foyerRow.nom, memberCount: members.length };
        }
        if (!cancelled) {
          setChoices(buildSouscriptionHolderChoices({ primary, secondary, foyer }));
        }
      } catch {
        if (!cancelled) setChoices(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, secondaryContactId, enabled]);

  return choices;
}
