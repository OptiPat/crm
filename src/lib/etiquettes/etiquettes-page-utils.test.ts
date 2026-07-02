import { describe, expect, it } from "vitest";
import type { EtiquetteWithCount } from "@/lib/api/tauri-etiquettes";
import {
  computeEtiquettesPageStats,
  filterEtiquettesByType,
  countEtiquettesByFilter,
  sortEtiquettesList,
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
    segment_id: null,
    pipeline_actif: false,
    rendement_cible: null,
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

  it("compte les étiquettes de segment comme auto, cohérent avec le filtre", () => {
    const list = [
      base({ id: 1, auto_condition_type: "DELAI_SANS_CONTACT", segment_id: null }),
      base({ id: 2, auto_condition_type: null, segment_id: 7 }),
      base({ id: 3, auto_condition_type: null, segment_id: null }),
    ];
    const counts = countEtiquettesByFilter(list);
    expect(counts.auto).toBe(filterEtiquettesByType(list, "auto").length);
    expect(counts.manual).toBe(filterEtiquettesByType(list, "manual").length);
    expect(counts.auto).toBe(2);
    expect(counts.manual).toBe(1);
  });

  it("trie selon le critère choisi sans muter l'entrée", () => {
    const list = [
      base({ id: 1, nom: "Bêta", contact_count: 1, priorite: 5, created_at: 100 }),
      base({ id: 2, nom: "alpha", contact_count: 9, priorite: 1, created_at: 300 }),
      base({ id: 3, nom: "Gamma", contact_count: 9, priorite: 8, created_at: 200 }),
    ];

    expect(sortEtiquettesList(list, "contacts").map((e) => e.id)).toEqual([3, 2, 1]);
    expect(sortEtiquettesList(list, "nom").map((e) => e.id)).toEqual([2, 1, 3]);
    expect(sortEtiquettesList(list, "priorite").map((e) => e.id)).toEqual([3, 1, 2]);
    expect(sortEtiquettesList(list, "recent").map((e) => e.id)).toEqual([2, 3, 1]);
    expect(list.map((e) => e.id)).toEqual([1, 2, 3]);
  });
});
