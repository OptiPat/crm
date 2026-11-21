import { describe, expect, it } from "vitest";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { buildSouscriptionVariables } from "@/lib/souscription-cif/build-variables";
import { buildCifDocumentFooterSegments } from "@/lib/souscription-cif/render-template";
import { defaultSouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

function cgp(patch: Partial<CgpConfig>): CgpConfig {
  return { wizard_completed: true, wizard_step: 0, ...patch } as CgpConfig;
}

describe("buildSouscriptionVariables — association CIF", () => {
  it("garde l'Anacofi par défaut pour les profils existants", () => {
    const vars = buildSouscriptionVariables(
      null,
      cgp({ cif_association_numero: " E011507 " }),
      defaultSouscriptionDossierFields()
    );
    expect(vars.cgp_association).toBe("l'Anacofi CIF");
    expect(vars.cgp_association_numero).toBe("E011507");
    expect(vars.cgp_anacofi_numero).toBe("E011507");
    expect(vars.cgp_association_adhesion).toBe("enregistré sous le n°E011507 auprès de l'Anacofi CIF");
    expect(vars.cgp_association_aupres).toBe("auprès de l'Anacofi CIF (n° E011507)");
    expect(vars.cgp_association_membre).toBe("membre n° E011507 de l'ANACOFI – CIF");
  });

  it("signale le numéro manquant pour l'Anacofi", () => {
    const vars = buildSouscriptionVariables(null, cgp({}), defaultSouscriptionDossierFields());
    expect(vars.cgp_association_adhesion).toBeNull();
    expect(vars.cgp_association_membre).toBeNull();
  });

  it("cite la CNCEF Patrimoine quand elle est choisie", () => {
    const vars = buildSouscriptionVariables(
      null,
      cgp({ cif_association: "cncef", cif_association_numero: "E011507" }),
      defaultSouscriptionDossierFields()
    );
    expect(vars.cgp_association).toBe("la CNCEF Patrimoine");
    expect(vars.cgp_association_adhesion).toBe("adhérent de la CNCEF Patrimoine");
    expect(vars.cgp_association_aupres).toBe("auprès de la CNCEF Patrimoine");
    expect(vars.cgp_association_membre).toBe("membre de la CNCEF Patrimoine");
    // Ancien numéro Anacofi resté en config : jamais imprimé pour la CNCEF.
    expect(vars.cgp_association_numero).toBeNull();
    expect(vars.cgp_anacofi_numero).toBeNull();
  });

  it("garde les pieds de page personnalisés qui citent {{cgp_anacofi_numero}}", () => {
    const vars = buildSouscriptionVariables(
      null,
      cgp({ cif_association_numero: "E011507" }),
      defaultSouscriptionDossierFields()
    );
    const segments = buildCifDocumentFooterSegments(vars, "Membre n° {{cgp_anacofi_numero}}");
    expect(segments.every((s) => s.kind === "text")).toBe(true);
    expect(segments.map((s) => (s.kind === "text" ? s.value : "")).join("")).toBe("Membre n° E011507");
  });
});

describe("buildSouscriptionVariables — forme d'exercice et immatriculation", () => {
  const base = { prenom: "Nicolas", nom: "PLAZA", cif_siren: "843 139 148", cif_rcs_ville: "Montpellier" };
  const vars = (patch: Partial<CgpConfig>) =>
    buildSouscriptionVariables(null, cgp({ ...base, ...patch }), defaultSouscriptionDossierFields());

  it("entrepreneur individuel au RSAC, avec nom commercial", () => {
    const v = vars({ cif_forme_exercice: "nom_propre", cif_registre: "RSAC", cabinet: "Fundly" });
    expect(v.cgp_designation).toBe(
      "Nicolas PLAZA, entrepreneur individuel, exerçant sous le nom commercial Fundly"
    );
    expect(v.cgp_immatriculation).toBe(
      "immatriculé au RSAC de Montpellier sous le numéro 843 139 148"
    );
    expect(v.cgp_registre_pied).toBe("RSAC Montpellier");
  });

  it("entrepreneur individuel au RNE seul : pas de ville de greffe", () => {
    const v = vars({ cif_forme_exercice: "nom_propre", cif_registre: "RNE", cif_rcs_ville: null });
    expect(v.cgp_designation).toBe("Nicolas PLAZA, entrepreneur individuel");
    expect(v.cgp_immatriculation).toBe(
      "immatriculé au Registre national des entreprises sous le numéro 843 139 148"
    );
    expect(v.cgp_registre_pied).toBe("RNE");
  });

  it("société au RCS (défaut des profils existants)", () => {
    const v = vars({ cabinet: "CABINET EXEMPLE" });
    expect(v.cgp_designation).toBe(
      "La société CABINET EXEMPLE, représentée par Nicolas PLAZA en qualité de gérant"
    );
    expect(v.cgp_immatriculation).toBe(
      "immatriculée au RCS de Montpellier sous le numéro 843 139 148"
    );
  });

  it("champs à compléter : société sans raison sociale, RCS sans ville", () => {
    expect(vars({}).cgp_designation).toBeNull();
    expect(vars({ cif_rcs_ville: null }).cgp_immatriculation).toBeNull();
  });
});
