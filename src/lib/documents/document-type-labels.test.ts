import { describe, expect, it } from "vitest";
import { DOCUMENT_TYPE_LABELS, getDocumentTypeLabel } from "./document-type-labels";

describe("document-type-labels", () => {
  it("IDENTITE inclut passeport", () => {
    expect(getDocumentTypeLabel("IDENTITE")).toBe("Pièce d'identité / Passeport");
  });

  it("retourne le code brut si inconnu", () => {
    expect(getDocumentTypeLabel("LEGACY")).toBe("LEGACY");
  });

  it("couvre les types standards", () => {
    expect(DOCUMENT_TYPE_LABELS.RELEVE).toBe("Relevé");
    expect(DOCUMENT_TYPE_LABELS.FISCAL).toBe("Document fiscal");
  });
});
