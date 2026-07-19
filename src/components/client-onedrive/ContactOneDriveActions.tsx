import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Cloud,
  FolderOpen,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClientOneDriveBrowsePanel } from "@/components/client-onedrive/ClientOneDriveBrowsePanel";
import {
  createContactOneDriveFolder,
  getClientOneDriveStatus,
  getContactOneDriveHealth,
  linkContactOneDriveFolder,
  resolveContactOneDriveFolder,
  unlinkContactOneDriveFolder,
  type ClientOneDriveFolderLink,
  type ClientOneDriveItem,
  type ContactOneDriveHealth,
} from "@/lib/api/tauri-client-onedrive";
import { getClientOneDriveStatusCache } from "@/lib/client-onedrive/client-onedrive-cache";
import {
  notifyClientOneDriveChanged,
  subscribeClientOneDriveChanged,
} from "@/lib/client-onedrive/client-onedrive-events";
import { openClientOneDriveFolderWithFeedback } from "@/lib/client-onedrive/open-client-onedrive-folder";
import { showOneDriveLinkSharedToast } from "@/lib/client-onedrive/link-onedrive-toast";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import {
  nestedStackedDialogClass,
  nestedStackedOutsideHandlers,
  nestedStackedPortalLayer,
} from "@/lib/ui/nested-stacked-dialog";
import { stopWheelPropagation } from "@/lib/ui/nested-sheet-scroll";
import { PortalLayerProvider } from "@/lib/ui/portal-layer-context";
import { toast } from "sonner";

function healthLabel(health: ContactOneDriveHealth | null): string | null {
  if (!health || health.status === "ok" || health.status === "not_linked") return null;
  switch (health.status) {
    case "not_connected":
      return "OneDrive non connecté";
    case "not_configured":
      return "Dossier racine clients non configuré";
    case "cloud_missing":
      return "Dossier introuvable sur OneDrive";
    case "out_of_root":
      return "Dossier hors de la racine clients";
    default:
      return "Lien OneDrive à vérifier";
  }
}

export function ContactOneDriveActions({
  contactId,
  nestedSheet = false,
  onOpenSettings,
}: {
  contactId: number;
  nestedSheet?: boolean;
  onOpenSettings?: () => void;
}) {
  const cachedStatus = getClientOneDriveStatusCache();
  const [loading, setLoading] = useState(!cachedStatus);
  const [busy, setBusy] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [connected, setConnected] = useState(cachedStatus?.connected ?? false);
  const [rootFolderId, setRootFolderId] = useState<string | null>(
    cachedStatus?.rootFolderId ?? null
  );
  const [link, setLink] = useState<ClientOneDriveFolderLink | null>(null);
  const [health, setHealth] = useState<ContactOneDriveHealth | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [status, folder, healthResult] = await Promise.all([
        getClientOneDriveStatus(),
        resolveContactOneDriveFolder(contactId),
        getContactOneDriveHealth(contactId).catch(() => null),
      ]);
      setConnected(status.connected);
      setRootFolderId(status.rootFolderId);
      setLink(folder);
      setHealth(healthResult);
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
    if (!link?.folderId) {
      toast.error("Dossier OneDrive introuvable — reliez-le depuis Paramètres.");
      return;
    }
    await openClientOneDriveFolderWithFeedback(link.folderId, {
      folderName: link.folderName,
    });
  };

  const createFolder = async () => {
    setBusy(true);
    try {
      const created = await createContactOneDriveFolder(contactId);
      setLink(created);
      notifyClientOneDriveChanged();
      toast.success(`Dossier créé : ${created.folderName}`);
      await openClientOneDriveFolderWithFeedback(created.folderId, {
        folderName: created.folderName,
      });
      void refresh(true);
    } catch (e) {
      toast.error(invokeErrorMessage(e) || "Création impossible");
    } finally {
      setBusy(false);
    }
  };

  const linkExistingFolder = async (item: ClientOneDriveItem) => {
    setBusy(true);
    try {
      const linkResult = await linkContactOneDriveFolder({
        contactId,
        folderId: item.id,
        folderName: item.name,
        webUrl: item.webUrl,
      });
      showOneDriveLinkSharedToast(linkResult);
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
      void refresh(true);
    } catch (e) {
      toast.error(invokeErrorMessage(e) || "Liaison impossible");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    setBusy(true);
    try {
      await unlinkContactOneDriveFolder(contactId);
      setLink(null);
      setUnlinkOpen(false);
      notifyClientOneDriveChanged();
      toast.success("Lien OneDrive retiré");
      void refresh(true);
    } catch (e) {
      toast.error(invokeErrorMessage(e) || "Impossible de retirer le lien");
    } finally {
      setBusy(false);
    }
  };

  const healthHint = healthLabel(health);
  const inheritedLink = link?.source === "inherited";
  const linkPickerDialog = (
    <Dialog open={linkPickerOpen} onOpenChange={setLinkPickerOpen} modal={!nestedSheet}>
      <DialogContent
        hideOverlay={nestedSheet}
        className={nestedStackedDialogClass("max-w-2xl", nestedSheet)}
        onWheel={nestedSheet ? stopWheelPropagation : undefined}
        {...nestedStackedOutsideHandlers(nestedSheet)}
      >
        <PortalLayerProvider layer={nestedStackedPortalLayer(nestedSheet)}>
          <DialogHeader>
            <DialogTitle>
              {link ? "Changer le dossier OneDrive" : "Relier un dossier OneDrive"}
            </DialogTitle>
            <DialogDescription>
              Choisissez le dossier client existant dans votre bibliothèque OneDrive.
            </DialogDescription>
          </DialogHeader>
          {rootFolderId ? (
            <ClientOneDriveBrowsePanel
              initialFolderId={rootFolderId}
              boundaryFolderId={rootFolderId}
              pickFolderLabel={link ? "Utiliser ce dossier" : "Relier ce dossier"}
              onPickFolder={(item) => void linkExistingFolder(item)}
            />
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Configurez d&apos;abord le dossier racine dans Paramètres → Intégrations.
            </p>
          )}
        </PortalLayerProvider>
      </DialogContent>
    </Dialog>
  );

  if (loading) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (!connected) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        title="Configurer OneDrive dans Paramètres → Intégrations"
        onClick={() => onOpenSettings?.()}
      >
        <Cloud className="h-4 w-4" />
        <span className="sr-only">Configurer OneDrive</span>
      </Button>
    );
  }

  if (link) {
    return (
      <>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-r-none border-r-0"
            title={
              healthHint
                ? `${healthHint} — ${link.folderName}`
                : `Ouvrir le dossier — ${link.folderName}`
            }
            onClick={() => void openFolder()}
          >
            {healthHint ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            <span className="sr-only">Ouvrir le dossier OneDrive</span>
          </Button>
          <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-l-none px-2"
                disabled={busy}
                title="Actions OneDrive"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                onClick={() => {
                  setActionsOpen(false);
                  setLinkPickerOpen(true);
                }}
              >
                <Link2 className="h-4 w-4" />
                Changer de dossier
              </button>
              {!inheritedLink ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-muted"
                  onClick={() => {
                    setActionsOpen(false);
                    setUnlinkOpen(true);
                  }}
                >
                  <Unlink className="h-4 w-4" />
                  Délier
                </button>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
        <AlertDialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
          <AlertDialogContent stacked={nestedSheet}>
            <AlertDialogHeader>
              <AlertDialogTitle>Retirer le lien OneDrive ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le dossier <strong>{link.folderName}</strong> reste sur OneDrive ; seul le lien
                dans le CRM sera supprimé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleUnlink()} disabled={busy}>
                Délier
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {linkPickerDialog}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="px-2"
          title="Relier un dossier OneDrive existant"
          disabled={busy || !rootFolderId}
          onClick={() => setLinkPickerOpen(true)}
        >
          <Link2 className="h-4 w-4" />
          <span className="sr-only">Relier un dossier OneDrive</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="px-2"
          title="Créer le dossier client sur OneDrive"
          disabled={busy || !rootFolderId}
          onClick={() => void createFolder()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="sr-only">Créer le dossier client</span>
        </Button>
      </div>
      {linkPickerDialog}
    </>
  );
}
