import { describe, expect, it } from "vitest";
import {
  describeR3ImmoRdvPlanningRevenue,
  patchR3ImmoRdvPlanningDraft,
  EMPTY_R3_IMMO_RDV_PLANNING_DRAFT,
} from "@/lib/pipe/pipe-r3-immo-rdv-planning";

describe("pipe-r3-immo-rdv-planning", () => {
  it("autorise salarié et chef d'entreprise ensemble (couple)", () => {
    const next = patchR3ImmoRdvPlanningDraft(EMPTY_R3_IMMO_RDV_PLANNING_DRAFT, {
      profile_salarie: true,
      profile_chef_entreprise: true,
    });
    expect(next.profile_salarie).toBe(true);
    expect(next.profile_chef_entreprise).toBe(true);
    expect(next.profile_revenus_configured).toBe(true);
  });

  it("signale la reprise R1 quand le draft n'a pas d'override", () => {
    const revenue = describeR3ImmoRdvPlanningRevenue({
      draft: EMPTY_R3_IMMO_RDV_PLANNING_DRAFT,
      r1Checklist: { profile_salarie: true, profile_chef_entreprise: false },
    });
    expect(revenue.fromR1).toBe(true);
    expect(revenue.label).toBe("Salarié");
  });

  it("marque profile_revenus_configured quand on ajuste un profil", () => {
    const next = patchR3ImmoRdvPlanningDraft(EMPTY_R3_IMMO_RDV_PLANNING_DRAFT, {
      profile_salarie: false,
      profile_chef_entreprise: false,
    });
    expect(next.profile_revenus_configured).toBe(true);
  });
});
