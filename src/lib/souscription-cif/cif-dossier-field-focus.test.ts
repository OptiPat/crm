import { describe, expect, it } from "vitest";
import {
  classifyCifVariableFocus,
  getCifDossierFieldFocus,
} from "@/lib/souscription-cif/cif-dossier-field-focus";

describe("cif-dossier-field-focus", () => {
  it("mappe les variables dossier vers le bon champ et onglet", () => {
    expect(getCifDossierFieldFocus("objectifs_client")).toEqual({
      fieldId: "cif-objectifs",
      document: "lettre-mission",
    });
    expect(getCifDossierFieldFocus("conseil")).toEqual({
      fieldId: "cif-conseil",
      document: "annexes-rapport",
    });
  });

  it("classifie client et CGP", () => {
    expect(classifyCifVariableFocus("client_nom_prenom")).toBe("client-profile");
    expect(classifyCifVariableFocus("cgp_orias")).toBe("cgp-profile");
    expect(classifyCifVariableFocus("date_der")).toBe("dossier-field");
  });
});
