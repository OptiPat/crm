import { describe, expect, it } from "vitest";
import {
  ONEDRIVE_SIMPLE_UPLOAD_MAX_BYTES,
  isDocumentTooLargeForOneDrive,
  resolveSendDocumentToOneDriveAction,
} from "@/lib/client-onedrive/send-document-to-onedrive";

describe("send-document-to-onedrive", () => {
  it("masque l'action sans client, connexion ou dossier lié", () => {
    expect(
      resolveSendDocumentToOneDriveAction({
        contactId: 1,
        tailleFichier: 100,
        onedriveConnected: false,
        contactLinked: true,
      }).show
    ).toBe(false);
    expect(
      resolveSendDocumentToOneDriveAction({
        contactId: 1,
        tailleFichier: 100,
        onedriveConnected: true,
        contactLinked: false,
      }).show
    ).toBe(false);
    expect(
      resolveSendDocumentToOneDriveAction({
        contactId: null,
        tailleFichier: 100,
        onedriveConnected: true,
        contactLinked: true,
      }).show
    ).toBe(false);
  });

  it("désactive l'action au-delà de 4 Mo", () => {
    expect(isDocumentTooLargeForOneDrive(ONEDRIVE_SIMPLE_UPLOAD_MAX_BYTES)).toBe(false);
    expect(isDocumentTooLargeForOneDrive(ONEDRIVE_SIMPLE_UPLOAD_MAX_BYTES + 1)).toBe(true);
    const action = resolveSendDocumentToOneDriveAction({
      contactId: 1,
      tailleFichier: ONEDRIVE_SIMPLE_UPLOAD_MAX_BYTES + 1,
      onedriveConnected: true,
      contactLinked: true,
    });
    expect(action.show).toBe(true);
    expect(action.disabled).toBe(true);
    expect(action.title).toContain("4 Mo");
  });
});
