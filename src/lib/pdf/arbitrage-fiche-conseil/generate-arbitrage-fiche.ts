import { getContactById } from "@/lib/api/tauri-contacts";
import { getInvestissementById } from "@/lib/api/tauri-investissements";
import { readPdfFile } from "@/lib/api/tauri-pdf";
import {
  getArbitrageFicheTemplatePath,
  writeDownloadsFileBytes,
  type ArbitrageFicheProductKind,
  type FicheConseilTemplateFamily,
} from "@/lib/api/tauri-arbitrage-fiche";
import { openDocumentFile } from "@/lib/api/tauri-system";
import { fillArbitrageFicheConseilPdf } from "@/lib/pdf/arbitrage-fiche-conseil/fill-fiche";
import { buildArbitrageFicheOutputFileName } from "@/lib/pdf/arbitrage-fiche-conseil/build-output-filename";
import type { VpModificationPdfFillInput } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";
export type GenerateArbitrageFicheConseilResult = {
  savedPath: string;
  opened: boolean;
};

export async function generateArbitrageFicheConseil(
  contactId: number,
  templateId: string,
  productKind: ArbitrageFicheProductKind,
  investissementId: number,
  templateFamily: FicheConseilTemplateFamily = "ARBITRAGE",
  options?: { vpModification?: VpModificationPdfFillInput }
): Promise<GenerateArbitrageFicheConseilResult> {
  if (!contactId) {
    throw new Error("Aucun contact lié.");
  }

  const templatePath = await getArbitrageFicheTemplatePath(
    templateId,
    productKind,
    templateFamily
  );
  const [contact, investissement, templateBytes] = await Promise.all([
    getContactById(contactId),
    getInvestissementById(investissementId),
    readPdfFile(templatePath),
  ]);

  if (investissement.contact_id != null && investissement.contact_id !== contactId) {
    throw new Error("Le contrat ne correspond pas au contact sélectionné.");
  }

  const filled = await fillArbitrageFicheConseilPdf(
    templateBytes,
    productKind,
    {
      nomClient: contact.nom,
      prenomClient: contact.prenom,
      numeroContrat: investissement.numero_contrat ?? null,
      vpModification: options?.vpModification,
    },
    { templateFamily }
  );
  const fileName = buildArbitrageFicheOutputFileName(
    productKind,
    contact.nom,
    contact.prenom,
    investissement.numero_contrat,
    templateFamily
  );
  const savedPath = await writeDownloadsFileBytes(fileName, filled);
  let opened = false;
  try {
    await openDocumentFile(savedPath);
    opened = true;
  } catch {
    // PDF déjà enregistré — l'ouverture système est optionnelle.
  }
  return { savedPath, opened };
}

/** @deprecated */
export const generateArbitrageAvFicheConseil = (
  contactId: number,
  templateId: string,
  investissementId: number
) => generateArbitrageFicheConseil(contactId, templateId, "AV", investissementId);
