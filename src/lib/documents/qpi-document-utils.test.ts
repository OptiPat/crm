import { describe, expect, it } from "vitest";
import type { Document } from "@/lib/api/tauri-documents";
import { latestQpiExperienceInvestissement } from "@/lib/documents/qpi-document-utils";

const qpiDoc = (overrides: Partial<Document>): Document =>
  ({
    id: 1,
    contact_id: 1,
    type_document: "QPI",
    nom_fichier: "qpi.pdf",
    chemin_fichier: "/tmp/qpi.pdf",
    taille_fichier: 100,
    created_at: 100,
    updated_at: 100,
    ...overrides,
  }) as Document;

describe("latestQpiExperienceInvestissement", () => {
  it("retourne le niveau du QPI le plus récent", () => {
    const level = latestQpiExperienceInvestissement([
      qpiDoc({ id: 1, experience_investissement: "Novice", created_at: 100 }),
      qpiDoc({ id: 2, experience_investissement: "Expérimenté", created_at: 200 }),
    ]);
    expect(level).toBe("Expérimenté");
  });

  it("ignore les documents sans niveau d'expérience", () => {
    expect(latestQpiExperienceInvestissement([qpiDoc({ experience_investissement: undefined })])).toBe(
      null
    );
  });
});
