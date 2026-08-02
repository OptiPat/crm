import { getContactById } from "@/lib/api/tauri-contacts";
import { getInvestissementById } from "@/lib/api/tauri-investissements";
import { readPdfFile } from "@/lib/api/tauri-pdf";
import {
  getArbitrageFicheTemplatePath,
  writeDownloadsFileBytes,
  type ArbitrageFicheProductKind,
} from "@/lib/api/tauri-arbitrage-fiche";
import { openDocumentFile } from "@/lib/api/tauri-system";
import { parseArbitrageInvestissementId } from "@/lib/alertes/arbitrage-alerte";
import { fillArbitrageFicheConseilPdf } from "@/lib/pdf/arbitrage-fiche-conseil/fill-fiche";
import { buildArbitrageFicheOutputFileName } from "@/lib/pdf/arbitrage-fiche-conseil/build-output-filename";
import type { Tache } from "@/lib/api/tauri-taches";

export type GenerateArbitrageFicheConseilResult = {
  savedPath: string;
  opened: boolean;
};

export async function generateArbitrageFicheConseil(
  tache: Tache,
  templateId: string,
  productKind: ArbitrageFicheProductKind
): Promise<GenerateArbitrageFicheConseilResult> {
  const investissementId = parseArbitrageInvestissementId(tache.description);
  if (investissementId == null) {
    throw new Error("Tâche arbitrage sans contrat lié.");
  }
  const contactId = tache.contacts[0]?.contact_id;
  if (!contactId) {
    throw new Error("Aucun contact lié à cette tâche.");
  }

  const templatePath = await getArbitrageFicheTemplatePath(templateId, productKind);
  const [contact, investissement, templateBytes] = await Promise.all([
    getContactById(contactId),
    getInvestissementById(investissementId),
    readPdfFile(templatePath),
  ]);

  const filled = await fillArbitrageFicheConseilPdf(templateBytes, productKind, {
    nomClient: contact.nom,
    prenomClient: contact.prenom,
    numeroContrat: investissement.numero_contrat ?? null,
  });
  const fileName = buildArbitrageFicheOutputFileName(
    productKind,
    contact.nom,
    contact.prenom,
    investissement.numero_contrat
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
  tache: Tache,
  templateId: string
) => generateArbitrageFicheConseil(tache, templateId, "AV");
