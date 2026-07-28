import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadOrganisationObjectifTablePrefs,
  saveOrganisationObjectifTablePrefs,
} from "./organisation-objectif-table-preferences";

describe("organisation-objectif-table-preferences", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  it("retourne un objet vide si rien n'est enregistré", () => {
    expect(loadOrganisationObjectifTablePrefs()).toEqual({});
  });

  it("persiste une valeur modifiée", () => {
    saveOrganisationObjectifTablePrefs({ targetGrowthPercent: 50 });
    expect(loadOrganisationObjectifTablePrefs()).toEqual({ targetGrowthPercent: 50 });
  });

  it("fusionne plusieurs champs enregistrés séparément", () => {
    saveOrganisationObjectifTablePrefs({ targetGrowthPercent: 50 });
    saveOrganisationObjectifTablePrefs({ attritionPercent: 20 });
    expect(loadOrganisationObjectifTablePrefs()).toEqual({
      targetGrowthPercent: 50,
      attritionPercent: 20,
    });
  });

  it("retire une clé quand la valeur vaut undefined (retour au suivi automatique)", () => {
    saveOrganisationObjectifTablePrefs({ targetGrowthPercent: 50, attritionPercent: 20 });
    saveOrganisationObjectifTablePrefs({ targetGrowthPercent: undefined });
    expect(loadOrganisationObjectifTablePrefs()).toEqual({ attritionPercent: 20 });
  });

  it("ignore un JSON corrompu sans planter", () => {
    storage.set("crm_organisation_objectif_table_v1", "{invalide");
    expect(loadOrganisationObjectifTablePrefs()).toEqual({});
  });
});
