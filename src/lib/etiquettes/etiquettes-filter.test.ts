import { describe, expect, it } from "vitest";
import { buildEtiquettesPourFiltre } from "./etiquettes-filter";
import type { Etiquette } from "@/lib/api/tauri-etiquettes";

const mk = (id: number, nom: string, actif: boolean): Etiquette =>
  ({
    id,
    nom,
    actif,
    couleur: "#000",
    icone: null,
    description: null,
    priorite: 0,
    auto_condition_type: null,
    auto_condition_config: null,
    auto_categories: null,
    email_template_id: null,
    email_delai_jours: 0,
    email_envoi_prevu: null,
    email_envoi_heure: null,
    email_envoi_jours_semaine: null,
    email_actif: false,
    is_default: false,
    segment_id: null,
    pipeline_actif: false,
    rendement_cible: null,
    created_at: 0,
    updated_at: 0,
  }) as Etiquette;

describe("buildEtiquettesPourFiltre", () => {
  it("includes inactive etiquettes still assigned to contacts", () => {
    const all = [mk(1, "Active", true), mk(2, "Old", false)];
    const par = { 10: [{ etiquette_id: 2 } as never] };
    const result = buildEtiquettesPourFiltre(all, par);
    expect(result.map((e) => e.id)).toEqual([1, 2]);
  });

  it("excludes inactive etiquettes with no assignments", () => {
    const all = [mk(1, "Active", true), mk(2, "Unused", false)];
    const result = buildEtiquettesPourFiltre(all, {});
    expect(result.map((e) => e.id)).toEqual([1]);
  });
});
