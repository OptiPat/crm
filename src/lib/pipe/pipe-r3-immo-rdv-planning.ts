import {
  getPipeR3ImmoDocumentChecklist,
  updatePipeR3ImmoDocumentChecklist,
  type PipeR3ImmoChecklistItems,
  type PipeR3ImmoDocumentChecklist,
} from "@/lib/api/tauri-pipe-r3-immo-checklist";
import type { PipeR1DocumentChecklist } from "@/lib/api/tauri-pipe-r1-checklist";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { notifyPipeR3ImmoChecklistChanged } from "@/lib/pipe/pipe-r3-immo-checklist-events";
import {
  buildR3ImmoChecklistContext,
  type R3ImmoChecklistContext,
} from "@/lib/pipe/r3-immo-document-checklist";
import {
  formatR3ImmoRevenueProfileLabel,
  resolveR3ImmoRevenueProfile,
} from "@/lib/pipe/r3-immo-r1-profile-sync";

export type R3ImmoRdvPlanningDraft = Pick<
  PipeR3ImmoDocumentChecklist,
  | "profile_salarie"
  | "profile_chef_entreprise"
  | "profile_revenus_configured"
  | "emprunteur_personne_morale"
  | "revenus_fonciers_hors_micro"
  | "revenus_via_sci"
  | "projet_vefa"
  | "projet_ancien"
  | "projet_scpi"
>;

export const EMPTY_R3_IMMO_RDV_PLANNING_DRAFT: R3ImmoRdvPlanningDraft = {
  profile_salarie: false,
  profile_chef_entreprise: false,
  profile_revenus_configured: false,
  emprunteur_personne_morale: false,
  revenus_fonciers_hors_micro: false,
  revenus_via_sci: false,
  projet_vefa: false,
  projet_ancien: false,
  projet_scpi: false,
};

export function r3ImmoRdvPlanningDraftFromChecklist(
  checklist: PipeR3ImmoDocumentChecklist
): R3ImmoRdvPlanningDraft {
  return {
    profile_salarie: checklist.profile_salarie,
    profile_chef_entreprise: checklist.profile_chef_entreprise,
    profile_revenus_configured: checklist.profile_revenus_configured,
    emprunteur_personne_morale: checklist.emprunteur_personne_morale,
    revenus_fonciers_hors_micro: checklist.revenus_fonciers_hors_micro,
    revenus_via_sci: checklist.revenus_via_sci,
    projet_vefa: checklist.projet_vefa,
    projet_ancien: checklist.projet_ancien,
    projet_scpi: checklist.projet_scpi,
  };
}

export function patchR3ImmoRdvPlanningDraft(
  draft: R3ImmoRdvPlanningDraft,
  patch: Partial<R3ImmoRdvPlanningDraft>
): R3ImmoRdvPlanningDraft {
  const next = { ...draft, ...patch };
  if (patch.profile_salarie !== undefined || patch.profile_chef_entreprise !== undefined) {
    next.profile_revenus_configured = true;
  }
  return next;
}

export function buildR3ImmoRdvPlanningContext(input: {
  contact: Contact;
  secondaryContactId?: number | null;
  foyerMembers: readonly Contact[];
  investissements: readonly Investissement[];
  r1Checklist?: Pick<
    PipeR1DocumentChecklist,
    "profile_salarie" | "profile_chef_entreprise"
  > | null;
  draft: R3ImmoRdvPlanningDraft;
  items?: PipeR3ImmoChecklistItems;
}): R3ImmoChecklistContext {
  return buildR3ImmoChecklistContext({
    contact: input.contact,
    secondaryContactId: input.secondaryContactId,
    foyerMembers: input.foyerMembers,
    investissements: input.investissements,
    r1Checklist: input.r1Checklist,
    checklist: {
      pipe_id: 0,
      ...input.draft,
      items: input.items ?? {},
      updated_at: 0,
    },
  });
}

export function describeR3ImmoRdvPlanningRevenue(input: {
  draft: R3ImmoRdvPlanningDraft;
  r1Checklist?: Pick<
    PipeR1DocumentChecklist,
    "profile_salarie" | "profile_chef_entreprise"
  > | null;
}): { fromR1: boolean; label: string | null } {
  const revenue = resolveR3ImmoRevenueProfile(input.draft, input.r1Checklist);
  return {
    fromR1: revenue.source === "r1",
    label: formatR3ImmoRevenueProfileLabel(revenue),
  };
}

export async function loadR3ImmoRdvPlanningDraftForPipe(
  pipeId: number
): Promise<R3ImmoRdvPlanningDraft> {
  if (pipeId <= 0) return { ...EMPTY_R3_IMMO_RDV_PLANNING_DRAFT };
  const checklist = await getPipeR3ImmoDocumentChecklist(pipeId);
  return r3ImmoRdvPlanningDraftFromChecklist(checklist);
}

export async function saveR3ImmoChecklistContextForPipe(
  pipeId: number,
  draft: R3ImmoRdvPlanningDraft
): Promise<void> {
  if (pipeId <= 0) return;
  await updatePipeR3ImmoDocumentChecklist(pipeId, draft);
  notifyPipeR3ImmoChecklistChanged({ pipeId, missingItemKeys: [] });
}
