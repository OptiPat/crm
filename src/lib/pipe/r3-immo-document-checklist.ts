import type {
  PipeR3ImmoChecklistItemState,
  PipeR3ImmoChecklistItems,
  PipeR3ImmoDocumentChecklist,
} from "@/lib/api/tauri-pipe-r3-immo-checklist";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { isContactAtLeastAge } from "@/lib/contacts/contact-birthday";
import { isRetiredProfession } from "@/lib/contacts/contact-occupation";
import { countEnfantsFoyer } from "@/lib/foyers/foyer-utils";
import { IMMOBILIER_TYPES } from "@/lib/investissements/investissement-display";
import { parseRdvTimelineTraceNote, rdvPlanOptionFromTraceNote } from "@/lib/pipe/pipe-rdv-delete";
import {
  isR3ImmoRdvEntryTitre,
  isR3ImmoRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import {
  cloneDefaultR3ImmoChecklistTemplate,
  r3ImmoItemLabelById,
  type R3ImmoChecklistItemDef,
  type R3ImmoChecklistTemplate,
  type R3ImmoVisibilityRule,
} from "@/lib/pipe/r3-immo-checklist-template";
import type { PipeR1DocumentChecklist } from "@/lib/api/tauri-pipe-r1-checklist";
import {
  resolveR3ImmoRevenueProfile,
  type R3ImmoRevenueProfileSource,
} from "@/lib/pipe/r3-immo-r1-profile-sync";

export const R3_IMMO_ESTIMATIF_RETRAITE_MIN_AGE = 55;

export interface R3ImmoChecklistContext {
  contact: Pick<
    Contact,
    | "situation_familiale"
    | "profession"
    | "statut_occupation_logement"
    | "charges_emprunts"
    | "date_naissance"
  >;
  hasSecondaryContact: boolean;
  foyerMembers: readonly Contact[];
  investissements: readonly Investissement[];
  checklist: Pick<
    PipeR3ImmoDocumentChecklist,
    | "profile_salarie"
    | "profile_chef_entreprise"
    | "emprunteur_personne_morale"
    | "revenus_fonciers_hors_micro"
    | "revenus_via_sci"
    | "projet_vefa"
    | "projet_ancien"
    | "projet_scpi"
  >;
  /** Origine du profil salarié / chef (reprise R1 ou saisie R3 immo). */
  revenueProfileSource: R3ImmoRevenueProfileSource;
}

export function getChecklistItemState(
  items: PipeR3ImmoChecklistItems,
  itemId: string
): PipeR3ImmoChecklistItemState {
  return items[itemId] ?? { received: false };
}

export function isR3ImmoChecklistItemComplete(item: PipeR3ImmoChecklistItemState): boolean {
  return item.received;
}

function hasImmoPatrimoine(investissements: readonly Investissement[]): boolean {
  return investissements.some((inv) =>
    IMMOBILIER_TYPES.includes(inv.type_produit as (typeof IMMOBILIER_TYPES)[number])
  );
}

function investissementImmoHasCreditEnCours(inv: Investissement): boolean {
  if (!IMMOBILIER_TYPES.includes(inv.type_produit as (typeof IMMOBILIER_TYPES)[number])) {
    return false;
  }
  if (inv.credit_crd != null && inv.credit_crd > 0) return true;
  if (inv.mensualite_credit != null && inv.mensualite_credit > 0) return true;
  if (inv.date_fin_pret != null && inv.date_fin_pret > 0) return true;
  return false;
}

function hasCreditsEnCours(
  contact: R3ImmoChecklistContext["contact"],
  investissements: readonly Investissement[]
): boolean {
  if ((contact.charges_emprunts ?? 0) > 0) return true;
  return investissements.some(investissementImmoHasCreditEnCours);
}

export function isR3ImmoVisibilityRuleActive(
  rule: R3ImmoVisibilityRule,
  ctx: R3ImmoChecklistContext
): boolean {
  switch (rule) {
    case "always":
      return true;
    case "couple_or_enfants":
      return ctx.hasSecondaryContact || countEnfantsFoyer(ctx.foyerMembers) > 0;
    case "marie_or_pacse":
      return (
        ctx.contact.situation_familiale === "MARIE" || ctx.contact.situation_familiale === "PACSE"
      );
    case "divorce":
      return ctx.contact.situation_familiale === "DIVORCE";
    case "separe":
      return ctx.contact.situation_familiale === "SEPARE";
    case "salarie":
      return ctx.checklist.profile_salarie && !isRetiredProfession(ctx.contact.profession);
    case "salarie_ou_retraite":
      return (
        ctx.checklist.profile_salarie || isRetiredProfession(ctx.contact.profession)
      );
    case "chef":
      return ctx.checklist.profile_chef_entreprise;
    case "emprunteur_pm":
      return ctx.checklist.emprunteur_personne_morale;
    case "revenus_fonciers":
      return ctx.checklist.revenus_fonciers_hors_micro;
    case "revenus_sci":
      return ctx.checklist.revenus_via_sci;
    case "estimatif_retraite_55":
      return (
        isContactAtLeastAge(ctx.contact.date_naissance, R3_IMMO_ESTIMATIF_RETRAITE_MIN_AGE) &&
        !isRetiredProfession(ctx.contact.profession)
      );
    case "retraite_profession":
      return isRetiredProfession(ctx.contact.profession);
    case "locataire":
      return ctx.contact.statut_occupation_logement === "LOCATAIRE";
    case "heberge_gratuit":
      return ctx.contact.statut_occupation_logement === "HEBERGE_GRATUIT";
    case "proprietaire":
      return ctx.contact.statut_occupation_logement === "PROPRIETAIRE";
    case "patrimoine_immo":
      return hasImmoPatrimoine(ctx.investissements);
    case "proprietaire_ou_patrimoine_immo":
      return (
        ctx.contact.statut_occupation_logement === "PROPRIETAIRE" ||
        hasImmoPatrimoine(ctx.investissements)
      );
    case "credits_en_cours":
      return hasCreditsEnCours(ctx.contact, ctx.investissements);
    case "projet_vefa":
      return ctx.checklist.projet_vefa;
    case "projet_ancien":
      return ctx.checklist.projet_ancien;
    case "projet_scpi":
      return ctx.checklist.projet_scpi;
    default:
      return false;
  }
}

export function getActiveR3ImmoChecklistItems(
  ctx: R3ImmoChecklistContext,
  template: R3ImmoChecklistTemplate = cloneDefaultR3ImmoChecklistTemplate()
): R3ImmoChecklistItemDef[] {
  return template.items.filter((def) => isR3ImmoVisibilityRuleActive(def.rule, ctx));
}

export function countR3ImmoChecklistProgress(
  checklist: PipeR3ImmoDocumentChecklist,
  ctx: R3ImmoChecklistContext,
  template?: R3ImmoChecklistTemplate
): { received: number; total: number } {
  const definitions = getActiveR3ImmoChecklistItems(ctx, template);
  const total = definitions.length;
  const received = definitions.filter((def) =>
    isR3ImmoChecklistItemComplete(getChecklistItemState(checklist.items, def.id))
  ).length;
  return { received, total };
}

export function listMissingR3ImmoChecklistKeys(
  checklist: PipeR3ImmoDocumentChecklist,
  ctx: R3ImmoChecklistContext,
  template?: R3ImmoChecklistTemplate
): string[] {
  return getActiveR3ImmoChecklistItems(ctx, template)
    .filter(
      (def) =>
        !isR3ImmoChecklistItemComplete(getChecklistItemState(checklist.items, def.id))
    )
    .map((def) => def.id);
}

export function listMissingR3ImmoChecklistLabels(
  checklist: PipeR3ImmoDocumentChecklist,
  ctx: R3ImmoChecklistContext,
  template?: R3ImmoChecklistTemplate
): string[] {
  return listMissingR3ImmoChecklistKeys(checklist, ctx, template)
    .map((key) => r3ImmoItemLabelById(key, template))
    .filter((label): label is string => label != null);
}

export function mapR3ImmoChecklistKeysToLabels(
  keys: string[],
  template?: R3ImmoChecklistTemplate
): string[] {
  return keys
    .map((key) => r3ImmoItemLabelById(key, template))
    .filter((label): label is string => label != null);
}

export function isR3ImmoChecklistPastStage(stage: string): boolean {
  return stage === "GAGNEE" || stage === "PERDUE_OU_EN_ATTENTE";
}

/** Checklist immo visible uniquement pour RDV R3 Immo planifié. */
export function shouldShowR3ImmoDocumentChecklist(
  entries: PipeTimelineEntryRecord[]
): boolean {
  return entries.some((entry) => {
    if (entry.entry_type === "RDV") {
      return isR3ImmoRdvEntryTitre(entry.titre);
    }
    const trace = parseRdvTimelineTraceNote(entry.contenu);
    if (!trace || trace.kind !== "rescheduled") return false;
    const planOption = rdvPlanOptionFromTraceNote(entry.contenu);
    return planOption != null && isR3ImmoRdvPlanOption(planOption);
  });
}

export function defaultR3ImmoChecklistItems(): PipeR3ImmoChecklistItems {
  return {};
}

export function buildR3ImmoChecklistContext(input: {
  contact: Contact;
  secondaryContactId?: number | null;
  foyerMembers: readonly Contact[];
  investissements: readonly Investissement[];
  checklist: PipeR3ImmoDocumentChecklist;
  r1Checklist?: Pick<
    PipeR1DocumentChecklist,
    "profile_salarie" | "profile_chef_entreprise"
  > | null;
}): R3ImmoChecklistContext {
  const revenue = resolveR3ImmoRevenueProfile(input.checklist, input.r1Checklist);
  return {
    contact: input.contact,
    hasSecondaryContact:
      input.secondaryContactId != null &&
      input.secondaryContactId > 0 &&
      input.secondaryContactId !== input.contact.id,
    foyerMembers: input.foyerMembers,
    investissements: input.investissements,
    checklist: {
      ...input.checklist,
      profile_salarie: revenue.profile_salarie,
      profile_chef_entreprise: revenue.profile_chef_entreprise,
    },
    revenueProfileSource: revenue.source,
  };
}
