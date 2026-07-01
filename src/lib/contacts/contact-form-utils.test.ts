import { describe, expect, it } from "vitest";
import {
  buildSubmitPayload,
  contactToFormData,
  defaultProchainSuiviClient,
  defaultProchainSuiviForClientStatut,
  defaultProchainSuiviSixMois,
  formatPhoneInput,
  applyFoyerAddressIfEmpty,
  getEmptyForm,
  isAlerteSuiviFilleul,
  normalizeImportCivilite,
  normalizeImportStatut,
  normalizeImportTmi,
  parseBirthdayFieldToIso,
  resolveImportContactCategories,
  suiviDatesOverrides,
} from "./contact-form-utils";
import type { Contact } from "@/lib/api/tauri-contacts";

describe("parseBirthdayFieldToIso", () => {
  it("accepte YYYY-MM-DD", () => {
    expect(parseBirthdayFieldToIso("1993-07-01")).toBe("1993-07-01T00:00:00.000Z");
  });

  it("accepte JJ/MM/AAAA", () => {
    expect(parseBirthdayFieldToIso("01/07/1993")).toBe("1993-07-01T00:00:00.000Z");
  });

  it("renvoie undefined si vide ou invalide", () => {
    expect(parseBirthdayFieldToIso("")).toBeUndefined();
    expect(parseBirthdayFieldToIso("abc")).toBeUndefined();
  });
});

describe("buildSubmitPayload alwaysSendBirthday", () => {
  it("inclut date_naissance vide pour effacement explicite", () => {
    const payload = buildSubmitPayload(
      { nom: "X", prenom: "Jean", categorie: "CLIENT", date_naissance: "" },
      { alwaysSendBirthday: true }
    );
    expect(payload.date_naissance).toBe("");
  });

  it("omet date_naissance si absent et alwaysSendBirthday false", () => {
    const payload = buildSubmitPayload({ nom: "X", prenom: "Jean", categorie: "CLIENT" });
    expect(payload.date_naissance).toBeUndefined();
  });
});

describe("defaultProchainSuiviClient", () => {
  it("propose J+1 an", () => {
    const ref = new Date(2026, 5, 1);
    expect(defaultProchainSuiviClient(ref)).toBe("2027-06-01");
  });
});

describe("getEmptyForm", () => {
  it("préremplit le prochain suivi suspect client à J+6 mois", () => {
    const form = getEmptyForm("clients");
    expect(form.date_prochain_suivi).toBe(defaultProchainSuiviSixMois());
  });

  it("préremplit le prochain suivi filleul à J+6 mois", () => {
    const form = getEmptyForm("filleuls");
    expect(form.date_prochain_suivi_filleul).toBe(defaultProchainSuiviSixMois());
  });
});

describe("defaultProchainSuiviForClientStatut", () => {
  it("1 an pour client, 6 mois pour prospect/suspect", () => {
    const ref = new Date(2026, 5, 1);
    expect(defaultProchainSuiviForClientStatut("CLIENT", ref)).toBe("2027-06-01");
    expect(defaultProchainSuiviForClientStatut("PROSPECT_CLIENT", ref)).toBe("2026-12-01");
    expect(defaultProchainSuiviForClientStatut("SUSPECT_CLIENT", ref)).toBe("2026-12-01");
  });
});

describe("resolveImportContactCategories", () => {
  it("client si produit", () => {
    expect(resolveImportContactCategories(true, false, false)).toEqual({
      categorie: "CLIENT",
      filleul_categorie: undefined,
    });
  });

  it("filleul prospect si contact sans produit", () => {
    expect(resolveImportContactCategories(false, true, true)).toEqual({
      categorie: "AUCUN",
      filleul_categorie: "PROSPECT_FILLEUL",
    });
  });

  it("respecte le statut explicite Finzzle (sans produit ni filleul)", () => {
    expect(resolveImportContactCategories(false, false, false, "Client").categorie).toBe("CLIENT");
    expect(resolveImportContactCategories(false, false, false, "Prospect").categorie).toBe(
      "PROSPECT_CLIENT"
    );
    expect(resolveImportContactCategories(false, false, false, "Contact").categorie).toBe(
      "SUSPECT_CLIENT"
    );
  });

  it("le produit prime sur le statut explicite (toujours CLIENT)", () => {
    expect(resolveImportContactCategories(true, false, false, "Contact").categorie).toBe("CLIENT");
  });

  it("retombe sur l'inférence par défaut si statut inconnu/absent", () => {
    expect(resolveImportContactCategories(false, true, false, "Bizarre").categorie).toBe(
      "PROSPECT_CLIENT"
    );
    expect(resolveImportContactCategories(false, false, false).categorie).toBe("SUSPECT_CLIENT");
  });
});

describe("normalizeImportStatut", () => {
  it("mappe les libellés Finzzle vers les catégories CRM", () => {
    expect(normalizeImportStatut("Client")).toBe("CLIENT");
    expect(normalizeImportStatut("prospect")).toBe("PROSPECT_CLIENT");
    expect(normalizeImportStatut("  Contact ")).toBe("SUSPECT_CLIENT");
  });

  it("accepte aussi les codes CRM directs", () => {
    expect(normalizeImportStatut("SUSPECT_CLIENT")).toBe("SUSPECT_CLIENT");
    expect(normalizeImportStatut("AUCUN")).toBe("AUCUN");
  });

  it("renvoie undefined pour vide ou inconnu", () => {
    expect(normalizeImportStatut("")).toBeUndefined();
    expect(normalizeImportStatut(null)).toBeUndefined();
    expect(normalizeImportStatut("Partenaire")).toBeUndefined();
  });
});

describe("normalizeImportCivilite", () => {
  it("mappe Madame/Monsieur vers les codes CRM", () => {
    expect(normalizeImportCivilite("Madame")).toBe("MME");
    expect(normalizeImportCivilite("Monsieur")).toBe("M");
    expect(normalizeImportCivilite("M.")).toBe("M");
    expect(normalizeImportCivilite("Mme")).toBe("MME");
  });

  it("renvoie undefined pour vide ou inconnu", () => {
    expect(normalizeImportCivilite("")).toBeUndefined();
    expect(normalizeImportCivilite(null)).toBeUndefined();
    expect(normalizeImportCivilite("Docteur")).toBeUndefined();
  });
});

describe("normalizeImportTmi", () => {
  it("formate un nombre brut en pourcentage", () => {
    expect(normalizeImportTmi("11")).toBe("11 %");
    expect(normalizeImportTmi("30")).toBe("30 %");
    expect(normalizeImportTmi(41)).toBe("41 %");
  });

  it("tolère un % ou une virgule décimale déjà présents", () => {
    expect(normalizeImportTmi("30 %")).toBe("30 %");
    expect(normalizeImportTmi("11,5")).toBe("11,5 %");
  });

  it("renvoie undefined pour vide, « - » ou 0", () => {
    expect(normalizeImportTmi("")).toBeUndefined();
    expect(normalizeImportTmi("-")).toBeUndefined();
    expect(normalizeImportTmi("0")).toBeUndefined();
    expect(normalizeImportTmi(null)).toBeUndefined();
    expect(normalizeImportTmi("abc")).toBeUndefined();
  });
});

describe("suiviDatesOverrides", () => {
  const dates = {
    dernierContact: "2025-01-15",
    prochainSuivi: "2025-07-15",
  };

  it("dates client pour alerte client", () => {
    expect(suiviDatesOverrides("SUIVI_CLIENT_1AN", dates)).toEqual({
      date_dernier_contact: "2025-01-15",
      date_prochain_suivi: "2025-07-15",
    });
  });

  it("dates filleul pour alerte filleul", () => {
    expect(suiviDatesOverrides("SUIVI_FILLEUL_1AN", dates)).toEqual({
      date_dernier_contact_filleul: "2025-01-15",
      date_prochain_suivi_filleul: "2025-07-15",
    });
  });
});

describe("isAlerteSuiviFilleul", () => {
  it("détecte les types filleul", () => {
    expect(isAlerteSuiviFilleul("FILLEUL_SUIVI_6MOIS")).toBe(true);
    expect(isAlerteSuiviFilleul("SUIVI_CLIENT_1AN")).toBe(false);
  });
});

describe("contactToFormData", () => {
  const prescripteur: Contact = {
    id: 1,
    nom: "BOISSEZON",
    prenom: "Laure",
    categorie: "PRESCRIPTEUR",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
  };

  it("conserve la catégorie PRESCRIPTEUR à l'édition", () => {
    expect(contactToFormData(prescripteur).categorie).toBe("PRESCRIPTEUR");
  });

  it("ne remplace pas PRESCRIPTEUR par AUCUN à l'enregistrement", () => {
    const payload = buildSubmitPayload({
      ...contactToFormData(prescripteur),
      telephone: "0612345678",
    });
    expect(payload.categorie).toBe("PRESCRIPTEUR");
    expect(payload.telephone).toBe("0612345678");
  });

  it("permet de convertir un prescripteur en client", () => {
    const payload = buildSubmitPayload({
      ...contactToFormData(prescripteur),
      categorie: "CLIENT",
      date_prochain_suivi: "2027-01-01",
    });
    expect(payload.categorie).toBe("CLIENT");
    expect(payload.date_prochain_suivi).toBeTruthy();
  });
});

describe("formatPhoneInput", () => {
  it("formate un numéro français classique", () => {
    expect(formatPhoneInput("0612345678")).toBe("06 12 34 56 78");
  });

  it("formate un numéro international +33", () => {
    expect(formatPhoneInput("+33612345678")).toBe("+33 6 12 34 56 78");
  });

  it("accepte le préfixe 00", () => {
    expect(formatPhoneInput("0033612345678")).toBe("+33 6 12 34 56 78");
  });
});

describe("applyFoyerAddressIfEmpty", () => {
  const contacts: Contact[] = [
    {
      id: 1,
      nom: "Dupont",
      prenom: "Jean",
      categorie: "CLIENT",
      statut_suivi: "ACTIF",
      foyer_id: 10,
      adresse: "12 rue de Paris",
      code_postal: "75001",
      ville: "Paris",
      created_at: 0,
      updated_at: 0,
    },
    {
      id: 2,
      nom: "Dupont",
      prenom: "Marie",
      categorie: "CLIENT",
      statut_suivi: "ACTIF",
      foyer_id: 10,
      created_at: 0,
      updated_at: 0,
    },
  ];

  it("reprend l'adresse d'un conjoint de foyer si vide", () => {
    const result = applyFoyerAddressIfEmpty(
      { nom: "Dupont", prenom: "Marie", categorie: "CLIENT", foyer_id: 10 },
      contacts,
      2
    );
    expect(result.fromFoyer).toBe(true);
    expect(result.formData.adresse).toBe("12 rue de Paris");
    expect(result.formData.ville).toBe("Paris");
  });

  it("ne remplace pas une adresse déjà renseignée", () => {
    const result = applyFoyerAddressIfEmpty(
      {
        nom: "Dupont",
        prenom: "Marie",
        categorie: "CLIENT",
        foyer_id: 10,
        ville: "Lyon",
      },
      contacts,
      2
    );
    expect(result.fromFoyer).toBe(false);
    expect(result.formData.ville).toBe("Lyon");
  });

  it("accepte foyer_id en chaîne côté contact", () => {
    const contactsWithStringFoyerId: Contact[] = [
      {
        id: 1,
        nom: "Dupont",
        prenom: "Jean",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        foyer_id: "10" as unknown as number,
        adresse: "12 rue de Paris",
        code_postal: "75001",
        ville: "Paris",
        created_at: 0,
        updated_at: 0,
      },
    ];
    const result = applyFoyerAddressIfEmpty(
      { nom: "Dupont", prenom: "Marie", categorie: "CLIENT", foyer_id: 10 },
      contactsWithStringFoyerId,
      2
    );
    expect(result.fromFoyer).toBe(true);
    expect(result.formData.adresse).toBe("12 rue de Paris");
  });
});
