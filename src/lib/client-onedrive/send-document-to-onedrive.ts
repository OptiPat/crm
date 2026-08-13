/** Aligné sur `SIMPLE_UPLOAD_MAX_BYTES` (Graph upload simple, max 4 Mo). */
export const ONEDRIVE_SIMPLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

export function isDocumentTooLargeForOneDrive(tailleFichier: number): boolean {
  return tailleFichier > ONEDRIVE_SIMPLE_UPLOAD_MAX_BYTES;
}

export type SendDocumentToOneDriveAction = {
  show: boolean;
  disabled: boolean;
  title: string;
};

export function resolveSendDocumentToOneDriveAction(input: {
  contactId?: number | null;
  tailleFichier: number;
  onedriveConnected: boolean;
  contactLinked: boolean;
}): SendDocumentToOneDriveAction {
  if (input.contactId == null || !input.onedriveConnected || !input.contactLinked) {
    return { show: false, disabled: true, title: "" };
  }
  if (isDocumentTooLargeForOneDrive(input.tailleFichier)) {
    return {
      show: true,
      disabled: true,
      title: "Fichier trop volumineux pour OneDrive (max 4 Mo)",
    };
  }
  return {
    show: true,
    disabled: false,
    title: "Copie vers le dossier OneDrive du client (max 4 Mo)",
  };
}
