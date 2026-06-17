import { describe, expect, it } from "vitest";
import {
  buildCniOcrPlan,
  buildCniSideBySideImagePlan,
  buildPassportSinglePagePlan,
  buildRectoOnlyPlan,
  buildVersoOnlyCniPlan,
} from "@/lib/documents/extraction/identity-layout";
import {
  classifyImageLayout,
  inferIdentityDocumentKindFromPath,
  isLikelyCniSideBySideScan,
  refineIdentityDocumentKind,
  resolveIdentityDocumentKindFromPaths,
} from "@/lib/documents/extraction/identity-document-kind";
import {
  ANONYMOUS_CNI_MRZ_LINE1,
  ANONYMOUS_CNI_MRZ_LINE2,
} from "@/lib/identity/fixtures/anonymous-cni-mrz";
import { selectBestMrzOcrText } from "@/lib/documents/extraction/ocr/mrz-ocr";
import { resolveIdentityUserMessage } from "@/lib/identity/identity-status-messages";

describe("identity extraction layout", () => {
  it("2 pages CNI : recto p1 verso p2", () => {
    const plan = buildCniOcrPlan(2);
    expect(plan.find((p) => p.role === "recto")?.page).toBe(1);
    expect(plan.find((p) => p.role === "verso")?.page).toBe(2);
    expect(plan.find((p) => p.role === "mrz")?.mode).toBe("mrz");
  });

  it("2 pages CNI inversées : recto p2 verso p1", () => {
    const plan = buildCniOcrPlan(2, true);
    expect(plan.find((p) => p.role === "recto")?.page).toBe(2);
    expect(plan.find((p) => p.role === "verso")?.page).toBe(1);
    expect(plan.find((p) => p.role === "mrz")?.page).toBe(1);
  });

  it("passeport TD3 : MRZ en bas de page", () => {
    const plan = buildPassportSinglePagePlan(1);
    const mrz = plan.find((p) => p.role === "mrz");
    expect(mrz?.region?.topRatio).toBeGreaterThanOrEqual(0.7);
    expect(mrz?.scale).toBeGreaterThanOrEqual(5.5);
  });

  it("CNI scan paysage : moitiés gauche/droite", () => {
    const plan = buildCniSideBySideImagePlan();
    const recto = plan.find((p) => p.role === "recto");
    expect(recto?.region?.widthRatio).toBe(0.5);
    expect(plan.find((p) => p.role === "mrz")?.region?.leftRatio).toBe(0.5);
  });

  it("recto / verso seuls pour import 2 fichiers", () => {
    expect(buildRectoOnlyPlan()).toHaveLength(1);
    expect(buildRectoOnlyPlan()[0]?.role).toBe("recto");
    expect(buildVersoOnlyCniPlan().find((p) => p.role === "mrz")?.mode).toBe("mrz");
  });
});

describe("identity document kind", () => {
  it("détecte passeport depuis le nom de fichier", () => {
    expect(inferIdentityDocumentKindFromPath("C:/docs/passeport_dupont.pdf")).toBe("passport");
    expect(inferIdentityDocumentKindFromPath("scan_cni_martin.jpg")).toBe("cni");
  });

  it("résout le type depuis recto + verso", () => {
    expect(
      resolveIdentityDocumentKindFromPaths("recto.jpg", "passeport_verso.pdf")
    ).toBe("passport");
    expect(resolveIdentityDocumentKindFromPaths("cni_recto.jpg", "verso.jpg")).toBe("cni");
  });

  it("nom CNI prioritaire sur paysage", () => {
    expect(refineIdentityDocumentKind("cni", { width: 1600, height: 1200 })).toBe("cni");
    expect(isLikelyCniSideBySideScan("cni", { width: 1600, height: 1200 })).toBe(true);
  });

  it("image paysage sans indice → passeport", () => {
    expect(refineIdentityDocumentKind(undefined, { width: 1600, height: 1200 })).toBe("passport");
    expect(refineIdentityDocumentKind(undefined, { width: 1200, height: 1600 })).toBe("cni");
    expect(classifyImageLayout({ width: 1200, height: 1200 })).toBe("squareish");
  });
});

describe("selectBestMrzOcrText", () => {
  const validMrz = `
    ${ANONYMOUS_CNI_MRZ_LINE1}
    ${ANONYMOUS_CNI_MRZ_LINE2}
  `;

  it("préfère une MRZ vérifiable (vieille CNI 2×36)", () => {
    const noisy = `
      VALABLEJUSQU AU 10 01 2031
      IDFRABERNARD<<<<<O12O5O
      123456789O122LUC<<<<<<<<<<<85O3150M9
    `;
    const best = selectBestMrzOcrText([noisy, validMrz]);
    expect(best).toContain("IDFRABERNARD");
    expect(best).toContain("8503150M0");
  });
});

describe("resolveIdentityUserMessage", () => {
  it("message explicite MRZ illisible", () => {
    const msg = resolveIdentityUserMessage({
      mrzVerified: false,
      mrz: {
        format: "FRA_LEGACY",
        documentType: "ID",
        issuingCountry: "FRA",
        documentNumber: "x",
        surname: "X",
        givenNames: "Y",
        confidence: 30,
        rawLines: [],
        checksVerified: { documentNumber: false, birthDate: false, expiryDate: false },
      },
      dateNaissanceFr: undefined,
      lieuNaissance: undefined,
      userMessage: "mrz_detected_unverified",
      layout: "image",
      documentKind: "cni",
    });
    expect(msg).toContain("MRZ détectée mais illisible");
  });
});
