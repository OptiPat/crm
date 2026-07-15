import { describe, expect, it } from "vitest";
import { cifDocumentUsesPagination } from "@/lib/souscription-cif/cif-pagination-config";

describe("cifDocumentUsesPagination", () => {
  it("paginé pour tous les documents CIF (Paged.js)", () => {
    expect(cifDocumentUsesPagination("lettre-mission")).toBe(true);
    expect(cifDocumentUsesPagination("convention-rto")).toBe(true);
    expect(cifDocumentUsesPagination("rapport-mission")).toBe(true);
    expect(cifDocumentUsesPagination("annexes-rapport")).toBe(true);
  });
});
