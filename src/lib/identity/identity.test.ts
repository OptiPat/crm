import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_CNI_BIRTH_FR,
  ANONYMOUS_CNI_BIRTH_PLACE,
  ANONYMOUS_CNI_GIVEN,
  ANONYMOUS_CNI_MRZ_LINE1,
  ANONYMOUS_CNI_MRZ_LINE2,
  ANONYMOUS_CNI_SURNAME,
} from "@/lib/identity/fixtures/anonymous-cni-mrz";
import { mrzCheckDigit } from "@/lib/identity/mrz-checksum";
import { parseMrzFromText, parseMrzLines } from "@/lib/identity/mrz-parser";
import { extractVisualIdentityFields } from "@/lib/identity/visual-identity-parser";
import { parseIdentityFromText, parseIdentityFromRegions } from "@/lib/identity/parse-identity-document";
import { buildCniOcrPlan, resolveCniPdfLayout } from "@/lib/identity/identity-pdf-layout";
import { buildIdentityMergePatch, contactHasStoredBirthPlace, identityExpirationToDocumentDate } from "@/lib/identity/merge-identity-fields";
import type { Contact } from "@/lib/api/tauri-contacts";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";

describe("identity-field-validation", () => {
  it("rejette un faux nom issu de la date de validité", async () => {
    const { isPlausiblePersonName, isPlausibleBirthPlace } = await import(
      "@/lib/identity/identity-field-validation"
    );
    expect(isPlausiblePersonName("VALABLEJUSQU AU 10 01 2031")).toBe(false);
    expect(isPlausibleBirthPlace("SX Ancaise")).toBe(false);
    expect(isPlausibleBirthPlace("Montpellier")).toBe(true);
  });
});

describe("mrz-parser garbage", () => {
  it("ignore une fausse ligne MRZ sans chevrons", () => {
    const text = `
      Valable jusqu'au 10/01/2031
      VALABLEJUSQUAU10012031<<<<<<<<<<<<
      Nationalité Française
    `;
    expect(parseMrzFromText(text)).toBeNull();
  });
});

describe("mrz-checksum", () => {
  it("calcule le contrôle ICAO", () => {
    expect(mrzCheckDigit("L898902C")).toBe(3);
  });
});

describe("mrz-parser", () => {
  it("parse une ancienne CNI française 2×36", () => {
    const lines = [ANONYMOUS_CNI_MRZ_LINE1, ANONYMOUS_CNI_MRZ_LINE2];
    const parsed = parseMrzLines(lines);
    expect(parsed?.format).toBe("FRA_LEGACY");
    expect(parsed?.dateNaissance).toBe(ANONYMOUS_CNI_BIRTH_FR);
    expect(parsed?.surname).toBe(ANONYMOUS_CNI_SURNAME);
    expect(parsed?.givenNames).toContain(ANONYMOUS_CNI_GIVEN);
  });

  it("extrait la MRZ d'un bloc texte", () => {
    const text = `
      CARTE NATIONALE D'IDENTITE
      ${ANONYMOUS_CNI_MRZ_LINE1}
      ${ANONYMOUS_CNI_MRZ_LINE2}
    `;
    const parsed = parseMrzFromText(text);
    expect(parsed?.dateNaissance).toBe(ANONYMOUS_CNI_BIRTH_FR);
  });

  it("parse un passeport TD3 (2×44 ICAO)", () => {
    const lines = [
      "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<<",
      "L898902C<3UTO6908061F4606239ZE184226B<<<<<10",
    ];
    const parsed = parseMrzLines(lines);
    expect(parsed?.format).toBe("TD3");
    expect(parsed?.dateNaissance).toBe("06/08/1969");
    expect(parsed?.dateExpiration).toBe("23/06/2046");
    expect(parsed?.checksVerified.expiryDate).toBe(false);
    expect(parsed?.surname).toContain("ERIKSSON");
    expect(parsed?.checksVerified.birthDate).toBe(true);
  });

  it("parse une nouvelle CNI TD1 (3×30)", () => {
    const lines = [
      "I<UTOD231458907<<<<<<<<<<<<<<<",
      "7408122F1204159UTO<<<<<<<<<<<6",
      "ERIKSSON<<ANNA<MARIA<<<<<<<<<<",
    ];
    const parsed = parseMrzLines(lines);
    expect(parsed?.format).toBe("TD1");
    expect(parsed?.dateNaissance).toBe("12/08/1974");
    expect(parsed?.dateExpiration).toBe("15/04/2012");
    expect(parsed?.sex).toBe("F");
  });
});

describe("visual-identity-parser", () => {
  it("lit date avec espaces OCR et ignore la validité", () => {
    const fields = extractVisualIdentityFields(`
      Nom BÉRNARD
      Prénom(s)
      Luc
      Ne(e) le 15 03 1985
      a PARIS (75)
      Valable jusqu'au 10 01 2031
    `);
    expect(fields.nom).toBe("BÉRNARD");
    expect(fields.prenom).toBe("Luc");
    expect(fields.dateNaissance).toBe("15/03/1985");
    expect(fields.dateExpiration).toBe("10/01/2031");
    expect(fields.lieuNaissance).toBe("Paris (75)");
  });

  it("lit date et lieu au format CNI", () => {
    const fields = extractVisualIdentityFields(`
      Nom: BERNARD
      Prénom: Luc
      Né(e) le : 15.03.1985
      à : PARIS
      Taille : 1,75m
    `);
    expect(fields.nom).toBe("BERNARD");
    expect(fields.prenom).toBe("Luc");
    expect(fields.dateNaissance).toBe(ANONYMOUS_CNI_BIRTH_FR);
    expect(fields.lieuNaissance).toBe(ANONYMOUS_CNI_BIRTH_PLACE);
  });

  it("lit la date d'expiration passeport", () => {
    const fields = extractVisualIdentityFields(`
      Date d'expiration : 15/04/2032
      Né(e) le : 15.03.1985
    `);
    expect(fields.dateExpiration).toBe("15/04/2032");
  });

  it("ignore la nationalité comme lieu de naissance", () => {
    const fields = extractVisualIdentityFields(`
      Nationalité Française
      Sexe M
    `);
    expect(fields.lieuNaissance).toBeUndefined();
  });

  it("lit le lieu depuis un OCR passeport (département + ville)", () => {
    const fields = extractVisualIdentityFields(`
      run. des Hautes pynétiñen TARBES
      Date d'expiration : 11/09/2027
    `);
    expect(fields.lieuNaissance).toBe("Tarbes");
  });

  it("lit Place of birth sur passeport bilingue", () => {
    const fields = extractVisualIdentityFields(`
      Lieu de naissance / Place of birth
      PARIS (75001)
    `);
    expect(fields.lieuNaissance).toBe(ANONYMOUS_CNI_BIRTH_PLACE);
  });
});

describe("identity-pdf-layout", () => {
  it("2 pages : recto p1 verso p2", () => {
    expect(resolveCniPdfLayout(2)).toBe("two_pages");
    const plan = buildCniOcrPlan(2);
    expect(plan.find((p) => p.role === "recto")?.page).toBe(1);
    expect(plan.find((p) => p.role === "verso")?.page).toBe(2);
    expect(plan.find((p) => p.role === "mrz")?.mode).toBe("mrz");
  });

  it("1 page : recto haut verso bas", () => {
    expect(resolveCniPdfLayout(1)).toBe("single_page_both_sides");
    const plan = buildCniOcrPlan(1);
    expect(plan.filter((p) => p.page === 1).length).toBe(3);
    expect(plan.find((p) => p.role === "mrz")?.mode).toBe("mrz");
  });
});

describe("parse-identity-document regions", () => {
  it("recto et verso séparés (PDF 2 pages)", () => {
    const result = parseIdentityFromRegions({
      rectoText: `
        Nom: BERNARD
        Prénom: Luc
        Né(e) le : 15.03.1985
        à : PARIS
        Carte valable jusqu'au : 10/01/2031
      `,
      versoText: `
        ${ANONYMOUS_CNI_MRZ_LINE1}
        ${ANONYMOUS_CNI_MRZ_LINE2}
      `,
    });
    expect(result.mrzVerified).toBe(true);
    expect(result.dateNaissanceFr).toBe(ANONYMOUS_CNI_BIRTH_FR);
    expect(result.dateExpirationFr).toBe("10/01/2031");
    expect(result.lieuNaissance).toBe(ANONYMOUS_CNI_BIRTH_PLACE);
  });
});

describe("parse-identity-document legacy", () => {
  it("sans MRZ vérifiable : suggestions visuelles seulement", () => {
    const result = parseIdentityFromText(`
      Valable jusqu'au 10/01/2031
      Nationalité Française
      Nom: BERNARD
      Prénom: Luc
      Né(e) le : 15.03.1985
      à : PARIS
    `);
    expect(result.mrzVerified).toBe(false);
    expect(result.nom).toBe("BERNARD");
    expect(result.provenance.nom).toBe("visual_suggestion");
    expect(result.dateNaissanceFr).toBe("15/03/1985");
    expect(result.provenance.dateNaissance).toBe("visual_suggestion");
    expect(result.lieuNaissance).toBe("Paris");
  });

  it("MRZ vérifiée prime sur le visuel", () => {
    const result = parseIdentityFromText(`
      Né(e) le : 01.01.2000
      à : PARIS
      ${ANONYMOUS_CNI_MRZ_LINE1}
      ${ANONYMOUS_CNI_MRZ_LINE2}
    `);
    expect(result.mrzVerified).toBe(true);
    expect(result.dateNaissanceFr).toBe(ANONYMOUS_CNI_BIRTH_FR);
    expect(result.provenance.dateNaissance).toBe("mrz_verified");
    expect(result.lieuNaissance).toBe(ANONYMOUS_CNI_BIRTH_PLACE);
    expect(result.provenance.lieuNaissance).toBe("visual_suggestion");
  });
});

describe("merge-identity-fields", () => {
  const baseContact: Contact = {
    id: 1,
    categorie: "CLIENT",
    nom: "EXISTING",
    prenom: "Client",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
  };

  it("ne remplit que les champs vides", () => {
    const { patch, filledFields, skippedFields } = buildIdentityMergePatch(baseContact, {
      source: "mixed",
      confidence: 90,
      mrzVerified: true,
      provenance: {
        dateNaissance: "mrz_verified",
        dateExpiration: "none",
        lieuNaissance: "visual_suggestion",
        nom: "mrz_verified",
        prenom: "mrz_verified",
      },
      rawText: "",
      dateNaissanceFr: ANONYMOUS_CNI_BIRTH_FR,
      lieuNaissance: ANONYMOUS_CNI_BIRTH_PLACE,
      nom: ANONYMOUS_CNI_SURNAME,
      prenom: "Luc",
    });
    expect(patch.lieu_naissance).toBe(ANONYMOUS_CNI_BIRTH_PLACE);
    expect(patch.date_naissance).toBe("1985-03-15");
    expect(patch.nom).toBeUndefined();
    expect(skippedFields).toContain("Nom");
    expect(filledFields).toContain("Lieu de naissance");
  });

  it("patch date → payload contact persiste en base", () => {
    const contact: Contact = {
      id: 1,
      categorie: "CLIENT",
      nom: "DUPONT",
      prenom: "Jean",
      statut_suivi: "ACTIF",
      created_at: 0,
      updated_at: 0,
    };
    const { patch } = buildIdentityMergePatch(contact, {
      source: "mrz",
      confidence: 90,
      mrzVerified: true,
      provenance: {
        dateNaissance: "mrz_verified",
        dateExpiration: "none",
        lieuNaissance: "none",
        nom: "none",
        prenom: "none",
      },
      rawText: "",
      dateNaissanceFr: ANONYMOUS_CNI_BIRTH_FR,
      sex: "M",
    });
    const payload = contactToUpdatePayload(contact, patch);
    expect(payload.date_naissance).toMatch(/^1985-03-15T/);
    expect(payload.civilite).toBe("M");
  });

  it("convertit la fin de validité pour le document importé", () => {
    expect(identityExpirationToDocumentDate("10/01/2031")).toBe("2031-01-10");
    expect(identityExpirationToDocumentDate("")).toBeUndefined();
  });

  it("contactHasStoredBirthPlace ignore les chaînes vides", () => {
    expect(contactHasStoredBirthPlace(undefined)).toBe(false);
    expect(contactHasStoredBirthPlace("   ")).toBe(false);
    expect(contactHasStoredBirthPlace(ANONYMOUS_CNI_BIRTH_PLACE)).toBe(true);
  });
});
