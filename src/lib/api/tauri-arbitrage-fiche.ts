import { invoke } from "@tauri-apps/api/core";

export type ArbitrageFicheProductKind = "AV" | "PER";

/** Famille de modèles PDF (dossiers séparés sous AppData). */
export type FicheConseilTemplateFamily = "ARBITRAGE" | "VP_MODIFICATION";

export type ArbitrageFicheTemplate = {
  id: string;
  label: string;
  isDefault: boolean;
  createdAt: string;
};

/** @deprecated alias */
export type ArbitrageAvFicheTemplate = ArbitrageFicheTemplate;

export async function listArbitrageFicheTemplates(
  productKind: ArbitrageFicheProductKind,
  templateFamily: FicheConseilTemplateFamily = "ARBITRAGE"
): Promise<ArbitrageFicheTemplate[]> {
  return invoke<ArbitrageFicheTemplate[]>("list_arbitrage_fiche_templates_cmd", {
    productKind,
    templateFamily,
  });
}

export async function importArbitrageFicheTemplate(
  sourcePath: string,
  label: string,
  productKind: ArbitrageFicheProductKind,
  templateFamily: FicheConseilTemplateFamily = "ARBITRAGE"
): Promise<ArbitrageFicheTemplate> {
  return invoke<ArbitrageFicheTemplate>("import_arbitrage_fiche_template_cmd", {
    sourcePath,
    label,
    productKind,
    templateFamily,
  });
}

export async function removeArbitrageFicheTemplate(
  templateId: string,
  productKind: ArbitrageFicheProductKind,
  templateFamily: FicheConseilTemplateFamily = "ARBITRAGE"
): Promise<void> {
  return invoke("remove_arbitrage_fiche_template_cmd", {
    templateId,
    productKind,
    templateFamily,
  });
}

export async function setDefaultArbitrageFicheTemplate(
  templateId: string,
  productKind: ArbitrageFicheProductKind,
  templateFamily: FicheConseilTemplateFamily = "ARBITRAGE"
): Promise<void> {
  return invoke("set_default_arbitrage_fiche_template_cmd", {
    templateId,
    productKind,
    templateFamily,
  });
}

export async function getArbitrageFicheTemplatePath(
  templateId: string,
  productKind: ArbitrageFicheProductKind,
  templateFamily: FicheConseilTemplateFamily = "ARBITRAGE"
): Promise<string> {
  return invoke<string>("get_arbitrage_fiche_template_path_cmd", {
    templateId,
    productKind,
    templateFamily,
  });
}

export async function writeDownloadsFileBytes(
  fileName: string,
  bytes: Uint8Array
): Promise<string> {
  return invoke<string>("write_downloads_file_bytes_cmd", {
    fileName,
    bytes: Array.from(bytes),
  });
}

export async function writeContactDocumentBytes(
  contactId: number,
  fileName: string,
  bytes: Uint8Array
): Promise<string> {
  return invoke<string>("write_contact_document_bytes_cmd", {
    contactId,
    fileName,
    bytes: Array.from(bytes),
  });
}
