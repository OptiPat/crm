import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateArbitrageFicheConseil } from "@/lib/pdf/arbitrage-fiche-conseil/generate-arbitrage-fiche";

const getContactById = vi.fn();
const getInvestissementById = vi.fn();
const readPdfFile = vi.fn();
const getArbitrageFicheTemplatePath = vi.fn();
const writeDownloadsFileBytes = vi.fn();
const openDocumentFile = vi.fn();
const fillArbitrageFicheConseilPdf = vi.fn();

vi.mock("@/lib/api/tauri-contacts", () => ({
  getContactById: (...args: unknown[]) => getContactById(...args),
}));

vi.mock("@/lib/api/tauri-investissements", () => ({
  getInvestissementById: (...args: unknown[]) => getInvestissementById(...args),
}));

vi.mock("@/lib/api/tauri-pdf", () => ({
  readPdfFile: (...args: unknown[]) => readPdfFile(...args),
}));

vi.mock("@/lib/api/tauri-arbitrage-fiche", () => ({
  getArbitrageFicheTemplatePath: (...args: unknown[]) => getArbitrageFicheTemplatePath(...args),
  writeDownloadsFileBytes: (...args: unknown[]) => writeDownloadsFileBytes(...args),
}));

vi.mock("@/lib/api/tauri-system", () => ({
  openDocumentFile: (...args: unknown[]) => openDocumentFile(...args),
}));

vi.mock("@/lib/pdf/arbitrage-fiche-conseil/fill-fiche", () => ({
  fillArbitrageFicheConseilPdf: (...args: unknown[]) => fillArbitrageFicheConseilPdf(...args),
}));

describe("generateArbitrageFicheConseil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getArbitrageFicheTemplatePath.mockResolvedValue("C:/templates/av.pdf");
    readPdfFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    fillArbitrageFicheConseilPdf.mockResolvedValue(new Uint8Array([4, 5, 6]));
    writeDownloadsFileBytes.mockResolvedValue("C:/Downloads/fiche.pdf");
    openDocumentFile.mockResolvedValue(undefined);
    getContactById.mockResolvedValue({
      id: 10,
      nom: "DUPONT",
      prenom: "Jean",
    });
    getInvestissementById.mockResolvedValue({
      id: 42,
      contact_id: 10,
      numero_contrat: "AV-123",
    });
  });

  it("génère la fiche quand contact et contrat correspondent", async () => {
    const result = await generateArbitrageFicheConseil(10, "tpl-1", "AV", 42);
    expect(result.savedPath).toBe("C:/Downloads/fiche.pdf");
    expect(fillArbitrageFicheConseilPdf).toHaveBeenCalled();
  });

  it("rejette un investissement lié à un autre contact", async () => {
    getInvestissementById.mockResolvedValue({
      id: 42,
      contact_id: 99,
      numero_contrat: "AV-123",
    });

    await expect(generateArbitrageFicheConseil(10, "tpl-1", "AV", 42)).rejects.toThrow(
      "Le contrat ne correspond pas au contact sélectionné."
    );
    expect(fillArbitrageFicheConseilPdf).not.toHaveBeenCalled();
  });

  it("rejette contactId absent", async () => {
    await expect(generateArbitrageFicheConseil(0, "tpl-1", "AV", 42)).rejects.toThrow(
      "Aucun contact lié."
    );
  });
});
