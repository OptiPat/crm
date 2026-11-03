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
