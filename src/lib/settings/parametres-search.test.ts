import { describe, expect, it } from "vitest";
import { filterParametresSearch } from "@/lib/settings/parametres-search";
import { getSetupChecklist } from "@/lib/settings/parametres-completion";
import { resolveSettingsSection } from "@/lib/settings/parametres-section-resolve";
import {
  isParametresExternalSection,
  SETTINGS_NAV_FLAT,
  SETTINGS_NAV_GROUPS,
} from "@/lib/settings/parametres-nav";

const EMPTY_CGP = {
  nom: "",
  prenom: "",
  cabinet: "",
  email: "",
  telephone: "",
  agenda_links: [] as { id: string; label: string; url: string }[],
  logo_path: "",
  wizard_completed: true,
  wizard_step: 4,
  email_signature: "",
  email_signature_html: "",
  email_suivi_delai_jours: 5,
  site_web: "",
  adresse: "",
  code_postal: "",
  ville: "",
  cif_siren: "",
  cif_rcs_ville: "",
  cif_anacofi_numero: "",
  cif_orias: "",
  cif_pied_de_page: "",
};

describe("parametres-nav", () => {
  it("regroupe la nav : emails en 5 entrées, sans newsletter ni comptabilité", () => {
    expect(SETTINGS_NAV_GROUPS).toHaveLength(4);
    const ids = SETTINGS_NAV_FLAT.map((item) => item.id);
    expect(ids).not.toContain("newsletter");
    expect(ids).not.toContain("comptabilite");
    expect(ids).toContain("email-connexion");
    expect(ids).toContain("email-signature");
    expect(ids).toContain("email-stellium");
    expect(ids).toContain("suivi");
  });

  it("identifie les sections externes pour redirection", () => {
    expect(isParametresExternalSection("newsletter")).toBe(true);
    expect(isParametresExternalSection("comptabilite")).toBe(true);
    expect(isParametresExternalSection("email-connexion")).toBe(false);
  });

  it("renomme suivi et integrations dans les libellés affichés", () => {
    const suivi = SETTINGS_NAV_FLAT.find((i) => i.id === "suivi");
    const integrations = SETTINGS_NAV_FLAT.find((i) => i.id === "integrations");
    expect(suivi?.label).toBe("Agenda & RDV");
    expect(integrations?.label).toBe("Intégrations");
  });
});

describe("parametres-section-resolve", () => {
  it("mappe section legacy email + onglet vers les nouvelles sections", () => {
    expect(resolveSettingsSection("email")).toBe("email-connexion");
    expect(resolveSettingsSection("email", "signature")).toBe("email-signature");
    expect(resolveSettingsSection("email", "stellium")).toBe("email-stellium");
  });
});

describe("parametres-search", () => {
  it("trouve le mot de passe dans Logiciel", () => {
    const hits = filterParametresSearch("mot de passe");
    expect(hits.some((h) => h.id === "mot-de-passe")).toBe(true);
    expect(hits.find((h) => h.id === "mot-de-passe")?.section).toBe("application");
  });

  it("trouve la signature email dans sa section nav", () => {
    const sig = filterParametresSearch("signature").find((h) => h.id === "email-signature");
    expect(sig?.section).toBe("email-signature");
  });

  it("redirige newsletter et compta hors Paramètres", () => {
    const mistral = filterParametresSearch("mistral").find((h) => h.id === "newsletter-mistral");
    const compta = filterParametresSearch("drive").find((h) => h.id === "compta-config");
    expect(mistral?.externalPage).toBe("newsletter");
    expect(compta?.externalPage).toBe("comptabilite");
  });

  it("place Stellium dans Emails & envois", () => {
    const stellium = filterParametresSearch("stellium").find((h) => h.id === "email-stellium");
    expect(stellium?.section).toBe("email-stellium");
  });

  it("cible les bonnes sections checklist email", () => {
    const checklist = getSetupChecklist(EMPTY_CGP, false);
    expect(checklist.find((i) => i.id === "signature")?.section).toBe("email-signature");
    expect(checklist.find((i) => i.id === "oauth")?.section).toBe("email-connexion");
  });
});
