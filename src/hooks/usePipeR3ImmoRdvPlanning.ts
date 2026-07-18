import { useEffect, useMemo, useRef, useState } from "react";
import { getContactById, getContactsByFoyer, type Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { getPipeR1DocumentChecklist } from "@/lib/api/tauri-pipe-r1-checklist";
import { getPipeR3ImmoDocumentChecklist } from "@/lib/api/tauri-pipe-r3-immo-checklist";
import {
  buildR3ImmoRdvPlanningContext,
  describeR3ImmoRdvPlanningRevenue,
  EMPTY_R3_IMMO_RDV_PLANNING_DRAFT,
  r3ImmoRdvPlanningDraftFromChecklist,
  type R3ImmoRdvPlanningDraft,
} from "@/lib/pipe/pipe-r3-immo-rdv-planning";
import type { R3ImmoChecklistContext } from "@/lib/pipe/r3-immo-document-checklist";
import { loadInvestissementsForContactIds } from "@/lib/pipe/r3-immo-missing-docs-loader";
import {
  loadR3ImmoChecklistTemplate,
  type R3ImmoChecklistTemplate,
} from "@/lib/pipe/r3-immo-checklist-template";

export function usePipeR3ImmoRdvPlanning(options: {
  enabled: boolean;
  pipeId: number;
  primaryContactId: number;
  secondaryContactId?: number | null;
}) {
  const { enabled, pipeId, primaryContactId, secondaryContactId } = options;
  const [draft, setDraft] = useState<R3ImmoRdvPlanningDraft>(EMPTY_R3_IMMO_RDV_PLANNING_DRAFT);
  const [contact, setContact] = useState<Contact | null>(null);
  const [foyerMembers, setFoyerMembers] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<Investissement[]>([]);
  const [r1Checklist, setR1Checklist] = useState<Awaited<
    ReturnType<typeof getPipeR1DocumentChecklist>
  > | null>(null);
  const [template, setTemplate] = useState<R3ImmoChecklistTemplate | null>(null);
  const [planningReady, setPlanningReady] = useState(!enabled || pipeId <= 0);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    if (!enabled || pipeId <= 0) {
      setDraft(EMPTY_R3_IMMO_RDV_PLANNING_DRAFT);
      setContact(null);
      setFoyerMembers([]);
      setInvestissements([]);
      setR1Checklist(null);
      setTemplate(null);
      setPlanningReady(true);
      return;
    }

    setPlanningReady(false);
    const generation = ++loadGenerationRef.current;

    void (async () => {
      let loadedContact: Contact | null = null;
      if (primaryContactId > 0) {
        try {
          loadedContact = await getContactById(primaryContactId);
        } catch {
          loadedContact = null;
        }
      }

      const [checklist, loadedR1, loadedInvestissements, loadedTemplate] = await Promise.all([
        getPipeR3ImmoDocumentChecklist(pipeId),
        getPipeR1DocumentChecklist(pipeId).catch(() => null),
        primaryContactId > 0
          ? loadInvestissementsForContactIds(primaryContactId, secondaryContactId)
          : Promise.resolve([]),
        loadR3ImmoChecklistTemplate(),
      ]);

      const loadedFoyerMembers =
        loadedContact?.foyer_id != null && loadedContact.foyer_id > 0
          ? await getContactsByFoyer(loadedContact.foyer_id)
          : [];

      if (loadGenerationRef.current !== generation) return;

      setContact(loadedContact);
      setFoyerMembers(loadedFoyerMembers);
      setInvestissements(loadedInvestissements);
      setR1Checklist(loadedR1);
      setTemplate(loadedTemplate);
      setDraft(r3ImmoRdvPlanningDraftFromChecklist(checklist));
      setPlanningReady(true);
    })();
  }, [enabled, pipeId, primaryContactId, secondaryContactId]);

  const checklistContext = useMemo((): R3ImmoChecklistContext | null => {
    if (!contact || !planningReady) return null;
    return buildR3ImmoRdvPlanningContext({
      contact,
      secondaryContactId,
      foyerMembers,
      investissements,
      r1Checklist,
      draft,
    });
  }, [
    contact,
    draft,
    foyerMembers,
    investissements,
    planningReady,
    r1Checklist,
    secondaryContactId,
  ]);

  const revenue = useMemo(
    () => describeR3ImmoRdvPlanningRevenue({ draft, r1Checklist }),
    [draft, r1Checklist]
  );

  return {
    draft,
    setDraft,
    checklistContext,
    template,
    planningReady,
    revenueFromR1: revenue.fromR1,
    revenueLabel: revenue.label,
  };
}
