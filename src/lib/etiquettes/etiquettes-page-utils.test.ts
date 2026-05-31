import { describe, expect, it } from "vitest";
import type { EtiquetteWithCount } from "@/lib/api/tauri-etiquettes";
import {
  computeEtiquettesPageStats,
  filterEtiquettesByType,
  countEtiquettesByFilter,
} from "@/lib/etiquettes/etiquettes-page-utils";

const base = (overrides: Partial<EtiquetteWithCount>): EtiquetteWithCount =>
  ({
    id: 1,
    nom: "Suivi",
    couleur: "#000",
    icone: null,
    description: null,
    priorite: 10,
    auto_condition_type: "DELAI_SANS_CONTACT",
    auto_condition_config: null,
    auto_categories: null,
    email_template_id: null,
    email_delai_jours: 0,
    email_envoi_prevu: null,
    email_envoi_heure: null,
    email_actif: false,
    is_default: true,
    actif: true,
    created_at: 0,
    updated_at: 0,
    contact_count: 3,
    ...overrides,
  }) as EtiquetteWithCount;

describe("etiquettes-page-utils", () => {
  it("calcule les stats", () => {
    const stats = computeEtiquettesPageStats([
      base({ contact_count: 2 }),
      base({
        id: 2,
        auto_condition_type: null,
        email_actif: true,
        contact_count: 1,
      }),
    ]);
    expect(stats.totalEtiquettes).toBe(2);
    expect(stats.autoCount).toBe(1);
    expect(stats.manualCount).toBe(1);
    expect(stats.emailCount).toBe(1);
    expect(stats.contactsTagged).toBe(3);
  });

  it("filtre auto / manuel", () => {
    const list = [base({}), base({ id: 2, auto_condition_type: null })];
    expect(filterEtiquettesByType(list, "auto")).toHaveLength(1);
    expect(filterEtiquettesByType(list, "manual")).toHaveLength(1);
    expect(countEtiquettesByFilter(list).email).toBe(0);
  });
});
