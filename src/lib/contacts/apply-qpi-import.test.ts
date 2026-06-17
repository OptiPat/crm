import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { ExtractedData } from "@/lib/pdf";

const getContactById = vi.fn();
const updateContact = vi.fn();
const createContact = vi.fn();
const createDocument = vi.fn();

vi.mock("@/lib/api/tauri-contacts", () => ({
  getContactById: (...args: unknown[]) => getContactById(...args),
  updateContact: (...args: unknown[]) => updateContact(...args),
  createContact: (...args: unknown[]) => createContact(...args),
  findContactByEmail: vi.fn(),
  findContactByName: vi.fn(),
}));

vi.mock("@/lib/api/tauri-documents", () => ({
  createDocument: (...args: unknown[]) => createDocument(...args),
}));

import { applyQpiImport } from "./apply-qpi-import";

const existingClient: Contact = {
  id: 42,
  nom: "PLAZA",
  prenom: "Nicolas",
  email: "nicolas@example.com",
  telephone: "+33600000000",
  categorie: "CLIENT",
  statut_suivi: "ACTIF",
  profil_risque_sri: 3,
  created_at: 0,
  updated_at: 0,
};

const qpiData: ExtractedData = {
  typeDocument: "QPI",
  nom: "PLAZA",
  prenom: "Nicolas",
  profilRisque: 4,
  dateSignature: "15/06/2026",
  sensibiliteExtraFinanciere:
    "Vous ne souhaitez pas préciser vos préférences en matière de durabilité",
};

describe("applyQpiImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getContactById.mockResolvedValue(existingClient);
    updateContact.mockResolvedValue(existingClient);
  });

  it("ne rétrograde pas un CLIENT existant en SUSPECT_CLIENT", async () => {
    await applyQpiImport(qpiData, { effectiveContactId: 42 });

    expect(updateContact).toHaveBeenCalledTimes(1);
    const payload = updateContact.mock.calls[0][1];
    expect(payload.categorie).toBe("CLIENT");
    expect(payload.profil_risque_sri).toBe(4);
  });

  it("conserve email et téléphone déjà renseignés si absents du QPI", async () => {
    await applyQpiImport(qpiData, { effectiveContactId: 42 });

    const payload = updateContact.mock.calls[0][1];
    expect(payload.email).toBe("nicolas@example.com");
    expect(payload.telephone).toBe("+33600000000");
  });

  it("enregistre date de signature et durabilité sur le document QPI", async () => {
    await applyQpiImport(qpiData, {
      effectiveContactId: 42,
      uploadedFile: { path: "/tmp/qpi.pdf", name: "qpi.pdf", size: 1000 },
    });

    expect(createDocument).toHaveBeenCalledTimes(1);
    const doc = createDocument.mock.calls[0][0];
    expect(doc.type_document).toBe("QPI");
    expect(doc.date_document).toBe("2026-06-15");
    expect(doc.sensibilite_extra_financiere).toBe(qpiData.sensibiliteExtraFinanciere);
  });
});
