import { useEffect, useRef, useState } from "react";
import { getContactById, type Contact } from "@/lib/api/tauri-contacts";
import type { R1ChecklistProfile } from "@/lib/pipe/pipe-checklist-template";
import { loadR1ChecklistProfileForPipePlanning } from "@/lib/pipe/pipe-r1-checklist-email-vars";

const EMPTY_PROFILE: R1ChecklistProfile = {
  salarie: false,
  chef_entreprise: false,
  retraite: false,
};

export function usePipeR1RdvProfilePlanning(options: {
  enabled: boolean;
  pipeId: number;
  /** Contact principal de l'affaire (pas le co-contact). */
  primaryContactId: number;
}) {
  const { enabled, pipeId, primaryContactId } = options;
  const [profile, setProfile] = useState<R1ChecklistProfile>(EMPTY_PROFILE);
  const [profileReady, setProfileReady] = useState(!enabled || pipeId <= 0);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    if (!enabled || pipeId <= 0) {
      setProfile(EMPTY_PROFILE);
      setProfileReady(true);
      return;
    }

    setProfileReady(false);
    const generation = ++loadGenerationRef.current;

    void (async () => {
      let contact: Pick<Contact, "profession" | "date_naissance"> | null = null;
      if (primaryContactId > 0) {
        try {
          contact = await getContactById(primaryContactId);
        } catch {
          contact = null;
        }
      }

      const loadedProfile = await loadR1ChecklistProfileForPipePlanning(pipeId, contact);
      if (loadGenerationRef.current === generation) {
        setProfile(loadedProfile);
        setProfileReady(true);
      }
    })();
  }, [enabled, pipeId, primaryContactId]);

  return { profile, setProfile, profileReady };
}
