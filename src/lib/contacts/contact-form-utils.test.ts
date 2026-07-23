import { describe, expect, it } from "vitest";
import {
  buildSubmitPayload,
  contactToFormData,
  defaultProchainSuiviClient,
  defaultProchainSuiviForClientStatut,
  defaultProchainSuiviSixMois,
  formatPhoneInput,
  getClientLabel,
  getClientStatutSelectValue,
  normalizeImportTelephone,
  applyFoyerAddressIfEmpty,
  getEmptyForm,
  isAlerteSuiviFilleul,
  normalizeImportCivilite,
  normalizeImportPlaceName,
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

describe("getClientStatutSelectValue", () => {
  it("distingue client actif et ancien client", () => {
    expect(getClientStatutSelectValue("CLIENT", "ACTIF")).toBe("CLIENT");
    expect(getClientStatutSelectValue("CLIENT", "EN_PAUSE")).toBe("ANCIEN_CLIENT");
  });

  it("conserve les autres statuts", () => {
    expect(getClientStatutSelectValue("PROSPECT_CLIENT", "ACTIF")).toBe("PROSPECT_CLIENT");
    expect(getClientStatutSelectValue("PRESCRIPTEUR", "ACTIF")).toBe("PRESCRIPTEUR");
    expect(getClientStatutSelectValue("AUCUN", "ACTIF")).toBe("AUCUN");
  });
});

describe("getClientLabel", () => {
  it("affiche Ancien client quand statut_suivi EN_PAUSE", () => {
    expect(getClientLabel("CLIENT", "EN_PAUSE")).toBe("Ancien client");
    expect(getClientLabel("CLIENT", "ACTIF")).toBe("Client");
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

describe("normalizeImportPlaceName", () => {
  it("met une majuscule initiale par mot", () => {
    expect(normalizeImportPlaceName("MONTPELLIER")).toBe("Montpellier");
    expect(normalizeImportPlaceName("ST AUNES")).toBe("St Aunes");
    expect(normalizeImportPlaceName("FRANCE")).toBe("France");
    expect(normalizeImportPlaceName("  paris  ")).toBe("Paris");
  });

  it("gère les tirets", () => {
    expect(normalizeImportPlaceName("SAINT-ETIENNE")).toBe("Saint-Etienne");
  });

  it("renvoie une chaîne vide si absent", () => {
    expect(normalizeImportPlaceName("")).toBe("");
    expect(normalizeImportPlaceName(null)).toBe("");
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

  it("efface les champs funnel client quand statut AUCUN", () => {
    const payload = buildSubmitPayload({
      ...getEmptyForm("clients"),
      nom: "Dupont",
      prenom: "Jean",
      categorie: "AUCUN",
      date_r1: "2026-03-15",
    });
    expect(payload.date_r1).toBe("");
  });

  it("efface les champs funnel filleul quand statut filleul retiré", () => {
    const payload = buildSubmitPayload({
      ...getEmptyForm("filleuls"),
      nom: "Bernard",
      prenom: "Luc",
      categorie: "AUCUN",
      filleul_categorie: undefined,
      type_invitation_filleul: "JD",
      date_invitation_filleul: "2026-03-15",
      presence_invitation_filleul: 1,
    });
    expect(payload.type_invitation_filleul).toBeNull();
    expect("date_invitation_filleul" in payload).toBe(false);
    expect("date_inscription_filleul" in payload).toBe(false);
    expect(payload.presence_invitation_filleul).toBeNull();
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

describe("normalizeImportTelephone", () => {
  it("formate un mobile FR exporté avec bruit Finzzle", () => {
    expect(normalizeImportTelephone("+ () 06.52.13.88.22")).toBe("06 52 13 88 22");
    expect(normalizeImportTelephone("0624408866")).toBe("06 24 40 88 66");
  });

  it("interprète 33 sans + comme international", () => {
    expect(normalizeImportTelephone("+ () 33 06.08.35.52.99")).toBe("+33 6 08 35 52 99");
    expect(normalizeImportTelephone("33 608355299")).toBe("+33 6 08 35 52 99");
  });

  it("déplie le wrapper Excel texte", () => {
    expect(normalizeImportTelephone('="+33600000002"')).toBe("+33 6 00 00 00 02");
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
