import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { notifyClientOneDriveChanged } from "@/lib/client-onedrive/client-onedrive-events";
import {
  showContactOnedriveAutoCreateToast,
  showDocumentOnedriveImportToast,
} from "@/lib/client-onedrive/link-onedrive-toast";

const AUTO_CREATE_DONE_EVENT = "client-onedrive-auto-create-done";
const DOCUMENT_COPY_DONE_EVENT = "client-onedrive-document-copy-done";

interface ClientOneDriveAutoCreateEvent {
  contactId: number;
  linkCreated: boolean;
  message?: string | null;
}

interface ClientOneDriveDocumentCopyEvent {
  documentId: number;
  message?: string | null;
}

/** Toasts + refresh UI après opérations OneDrive lancées en arrière-plan. */
export function useOneDriveBackgroundListener(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    let unlistenAutoCreate: (() => void) | undefined;
    let unlistenDocumentCopy: (() => void) | undefined;
    let cancelled = false;

    void listen<ClientOneDriveAutoCreateEvent>(AUTO_CREATE_DONE_EVENT, (event) => {
      const { linkCreated, message } = event.payload;
      if (linkCreated) {
        notifyClientOneDriveChanged();
      }
      showContactOnedriveAutoCreateToast(message);
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenAutoCreate = fn;
    });

    void listen<ClientOneDriveDocumentCopyEvent>(DOCUMENT_COPY_DONE_EVENT, (event) => {
      showDocumentOnedriveImportToast(event.payload.message);
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenDocumentCopy = fn;
    });

    return () => {
      cancelled = true;
      unlistenAutoCreate?.();
      unlistenDocumentCopy?.();
    };
  }, [enabled]);
}
