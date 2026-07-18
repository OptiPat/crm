import type { PipeR1DocumentChecklist } from "@/lib/api/tauri-pipe-r1-checklist";
import type { PipeR3ImmoDocumentChecklist } from "@/lib/api/tauri-pipe-r3-immo-checklist";

export type R3ImmoRevenueProfileSource = "none" | "r1" | "r3_immo";

export interface R3ImmoResolvedRevenueProfile {
  profile_salarie: boolean;
  profile_chef_entreprise: boolean;
  source: R3ImmoRevenueProfileSource;
}

type RevenueProfilePick = Pick<
  PipeR1DocumentChecklist,
  "profile_salarie" | "profile_chef_entreprise"
>;

export function r1HasRevenueProfile(r1?: RevenueProfilePick | null): boolean {
  return Boolean(r1?.profile_salarie || r1?.profile_chef_entreprise);
}

export function r3ImmoHasRevenueProfileOverride(
  immo: Pick<PipeR3ImmoDocumentChecklist, "profile_revenus_configured">
): boolean {
  return immo.profile_revenus_configured;
}

/** Profil salarié / chef : override R3 immo explicite, sinon reprise automatique du R1. */
export function resolveR3ImmoRevenueProfile(
  immo: Pick<
    PipeR3ImmoDocumentChecklist,
    "profile_salarie" | "profile_chef_entreprise" | "profile_revenus_configured"
  >,
  r1?: RevenueProfilePick | null
): R3ImmoResolvedRevenueProfile {
  if (r3ImmoHasRevenueProfileOverride(immo)) {
    return {
      profile_salarie: immo.profile_salarie,
      profile_chef_entreprise: immo.profile_chef_entreprise,
      source: "r3_immo",
    };
  }
  if (r1HasRevenueProfile(r1)) {
    return {
      profile_salarie: r1!.profile_salarie,
      profile_chef_entreprise: r1!.profile_chef_entreprise,
      source: "r1",
    };
  }
  return { profile_salarie: false, profile_chef_entreprise: false, source: "none" };
}

export function formatR3ImmoRevenueProfileLabel(
  profile: Pick<R3ImmoResolvedRevenueProfile, "profile_salarie" | "profile_chef_entreprise">
): string | null {
  const parts: string[] = [];
  if (profile.profile_salarie) parts.push("Salarié");
  if (profile.profile_chef_entreprise) parts.push("Chef d'entreprise");
  return parts.length > 0 ? parts.join(" · ") : null;
}
