import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Link2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientOneDriveBrowsePanel } from "@/components/client-onedrive/ClientOneDriveBrowsePanel";
import {
  createContactOneDriveFolder,
  getClientOneDriveStatus,
  linkContactOneDriveFolder,
  resolveContactOneDriveFolder,
  type ClientOneDriveFolderLink,
  type ClientOneDriveItem,
} from "@/lib/api/tauri-client-onedrive";
import { getClientOneDriveStatusCache } from "@/lib/client-onedrive/client-onedrive-cache";
import {
  notifyClientOneDriveChanged,
  subscribeClientOneDriveChanged,
} from "@/lib/client-onedrive/client-onedrive-events";
import { openExternalUrl } from "@/lib/api/tauri-system";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import { toast } from "sonner";

export function ContactOneDriveActions({ contactId }: { contactId: number }) {
  const cachedStatus = getClientOneDriveStatusCache();
  const [loading, setLoading] = useState(!cachedStatus);
  const [busy, setBusy] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [connected, setConnected] = useState(cachedStatus?.connected ?? false);
  const [rootFolderId, setRootFolderId] = useState<string | null>(
    cachedStatus?.rootFolderId ?? null
  );
  const [link, setLink] = useState<ClientOneDriveFolderLink | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [status, folder] = await Promise.all([
        getClientOneDriveStatus(),
        resolveContactOneDriveFolder(contactId),
      ]);
      setConnected(status.connected);
      setRootFolderId(status.rootFolderId);
      setLink(folder);
    } catch (e) {
      console.error(e);
      if (!silent) {
        toast.error(invokeErrorMessage(e) || "OneDrive indisponible");
      }
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void refresh(!!cachedStatus);
  }, [refresh, cachedStatus]);

  useEffect(() => subscribeClientOneDriveChanged(() => void refresh(true)), [refresh]);

  const openFolder = async () => {
    if (!link?.webUrl) {
      toast.error("Dossier OneDrive introuvable — reliez-le depuis Paramètres.");
      return;
    }
    await openExternalUrl(link.webUrl);
  };

  const createFolder = async () => {
    setBusy(true);
    try {
      const created = await createContactOneDriveFolder(contactId);
      setLink(created);
      notifyClientOneDriveChanged();
      toast.success(`Dossier créé : ${created.folderName}`);
      if (created.webUrl) await openExternalUrl(created.webUrl);
    } catch (e) {
      toast.error(invokeErrorMessage(e) || "Création impossible");
    } finally {
      setBusy(false);
    }
  };

  const linkExistingFolder = async (item: ClientOneDriveItem) => {
    setBusy(true);
    try {
      await linkContactOneDriveFolder({
        contactId,
        folderId: item.id,
        folderName: item.name,
        webUrl: item.webUrl,
      });
      const linked: ClientOneDriveFolderLink = {
        folderId: item.id,
        folderName: item.name,
        webUrl: item.webUrl,
        source: "contact",
      };
      setLink(linked);
      setLinkPickerOpen(false);
      notifyClientOneDriveChanged();
      toast.success(`Dossier relié : ${item.name}`);
    } catch (e) {
      toast.error(invokeErrorMessage(e) || "Liaison impossible");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (!connected) return null;

  if (link) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        title={`Ouvrir OneDrive — ${link.folderName}`}
        onClick={() => void openFolder()}
      >
        <FolderOpen className="h-4 w-4" />
        <span className="sr-only md:not-sr-only">OneDrive</span>
      </Button>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          title="Relier un dossier OneDrive existant"
          disabled={busy || !rootFolderId}
          onClick={() => setLinkPickerOpen(true)}
        >
          <Link2 className="h-4 w-4" />
          <span className="sr-only md:not-sr-only">Relier</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          title="Créer le dossier client sur OneDrive"
          disabled={busy || !rootFolderId}
          onClick={() => void createFolder()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="sr-only md:not-sr-only">Créer</span>
        </Button>
      </div>

      <Dialog open={linkPickerOpen} onOpenChange={setLinkPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Relier un dossier OneDrive</DialogTitle>
            <DialogDescription>
              Choisissez le dossier client existant dans votre bibliothèque OneDrive.
            </DialogDescription>
          </DialogHeader>
          {rootFolderId ? (
            <ClientOneDriveBrowsePanel
              initialFolderId={rootFolderId}
              boundaryFolderId={rootFolderId}
              pickFolderLabel="Relier ce dossier"
              onPickFolder={(item) => void linkExistingFolder(item)}
            />
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Configurez d&apos;abord le dossier racine dans Paramètres → Intégrations.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
