import { invoke } from "@tauri-apps/api/core";

export type StagedDocumentFile = {
  path: string;
  name: string;
  size: number;
};

type LocalImageFile = {
  bytes: number[];
  mime: string;
};

export async function stageDocumentFile(sourcePath: string): Promise<StagedDocumentFile> {
  return invoke<StagedDocumentFile>("stage_document_file_cmd", { sourcePath });
}

export async function importManagedLogoFile(
  sourcePath: string,
  kind: "app" | "cabinet"
): Promise<string> {
  return invoke<string>("import_managed_logo_file_cmd", { sourcePath, kind });
}

export async function removeManagedLogoFile(kind: "app" | "cabinet"): Promise<void> {
  return invoke<void>("remove_managed_logo_file_cmd", { kind });
}

export async function readLocalImageFile(
  filePath: string
): Promise<{ bytes: Uint8Array; mime: string }> {
  const image = await invoke<LocalImageFile>("read_local_image_file_cmd", { filePath });
  return {
    bytes: Uint8Array.from(image.bytes),
    mime: image.mime,
  };
}

export function localImageToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

export async function readLocalImageDataUrl(filePath: string): Promise<string> {
  const image = await readLocalImageFile(filePath);
  return localImageToDataUrl(image.bytes, image.mime);
}

export async function readPublicBrandingLogoDataUrl(filePath: string): Promise<string> {
  const image = await invoke<LocalImageFile>("read_public_branding_logo_file_cmd", {
    filePath,
  });
  return localImageToDataUrl(Uint8Array.from(image.bytes), image.mime);
}
