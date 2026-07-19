import { useCallback, useEffect, useState } from "react";
import { FolderOpen, HardDrive, Link2, Loader2, ShieldAlert, Unplug } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientOneDriveBrowsePanel } from "@/components/client-onedrive/ClientOneDriveBrowsePanel";
import { ClientOneDriveLinkWizard } from "@/components/client-onedrive/ClientOneDriveLinkWizard";
import {
  connectMicrosoftOneDriveOAuth,
  disconnectMicrosoftOneDriveOAuth,
  getClientOneDriveStatus,
  saveClientOneDriveLocalSyncRoot,
  saveClientOneDriveRootFolder,
  type ClientOneDriveStatus,
} from "@/lib/api/tauri-client-onedrive";
import { getOAuthAppSettings, saveMicrosoftOAuthClientId } from "@/lib/api/tauri-email-oauth";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import { openExternalUrl } from "@/lib/api/tauri-system";
import {
  clearClientOneDriveCache,
  clearClientOneDriveBrowseCache,
  setClientOneDriveStatusCache,
} from "@/lib/client-onedrive/client-onedrive-cache";
import { toast } from "sonner";

export function ClientOneDriveSettingsPanel() {
  const [status, setStatus] = useState<ClientOneDriveStatus | null>(null);
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [savingClientId, setSavingClientId] = useState(false);
  const [rootPickerOpen, setRootPickerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [savingLocalRoot, setSavingLocalRoot] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [onedriveStatus, oauthSettings] = await Promise.all([
        getClientOneDriveStatus(),
        getOAuthAppSettings(),
      ]);
      setStatus(onedriveStatus);
      setClientOneDriveStatusCache(onedriveStatus);
      setMicrosoftClientId(oauthSettings.microsoft_client_id ?? "");
    } catch (e) {
      console.error(e);
      toast.error(invokeErrorMessage(e) || "Impossible de charger OneDrive clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSaveClientId = async () => {
    const trimmed = microsoftClientId.trim();
    if (!trimmed) {
      toast.error("Collez le Client ID Azure (UUID)");
      return;
    }
    setSavingClientId(true);
    try {
      await saveMicrosoftOAuthClientId(trimmed);
      await refresh();
      toast.success("Client ID Microsoft enregistré");
    } catch (e) {
      toast.error(invokeErrorMessage(e) || "Enregistrement impossible");
    } finally {
      setSavingClientId(false);
    }
  };

  const handleConnect = async () => {
    if (!clientIdReady) {
      toast.error("Enregistrez d'abord le Client ID Microsoft (Azure) ci-dessous.");
      return;
    }
    if (!status?.microsoftClientIdConfigured) {
      setSavingClientId(true);
      try {
        await saveMicrosoftOAuthClientId(microsoftClientId.trim());
        await refresh();
      } catch (e) {
        toast.error(invokeErrorMessage(e) || "Enregistrement du Client ID impossible");
        return;
      } finally {
        setSavingClientId(false);
      }
    }
    setConnecting(true);
    try {
      const next = await connectMicrosoftOneDriveOAuth({ forceConsent: false });
      setStatus(next);
      setClientOneDriveStatusCache(next);
      toast.success("Microsoft OneDrive connecté");
    } catch (e) {
      toast.error(invokeErrorMessage(e) || "Connexion impossible");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectMicrosoftOneDriveOAuth();
      clearClientOneDriveCache();
      await refresh();
      toast.success("OneDrive déconnecté");
    } catch (e) {
      toast.error(invokeErrorMessage(e) || "Déconnexion impossible");
    }
  };

  const handlePickLocalSyncRoot = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: status?.localSyncRoot ?? "D:\\OneDrive",
      title: "Dossier OneDrive sur ce PC (ex. D:\\OneDrive ou D:\\OneDrive\\Dossier Clients PRODEMIAL)",
    });
    if (!selected || typeof selected !== "string") return;
    setSavingLocalRoot(true);
    try {
      await saveClientOneDriveLocalSyncRoot(selected);
      await refresh();
      toast.success("Dossier OneDrive local enregistré");
    } catch (e) {
      toast.error(invokeErrorMessage(e) || "Enregistrement impossible");
    } finally {
      setSavingLocalRoot(false);
    }
  };

  const clientIdReady =
    status?.microsoftClientIdConfigured || microsoftClientId.trim().length > 0;

  return (
    <>
      <SettingsPanel
        title="Dossiers clients OneDrive"
        description="Microsoft Graph API — compatible avec Gmail pour les mails."
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3 text-sm space-y-2">
              <p className="font-medium">Prérequis Azure (une seule fois)</p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-1 text-xs leading-relaxed">
                <li>
                  <button
                    type="button"
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() =>
                      void openExternalUrl(
                        "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                      )
                    }
                  >
                    Azure → App registrations
                  </button>{" "}
                  → nouvelle app, comptes personnels Microsoft inclus
                </li>
                <li>
                  Menu <strong>Authentication (Preview)</strong> → plateforme{" "}
                  <strong>Applications clientes publiques/mobiles et de bureau</strong> → URI :{" "}
                  <code className="bg-muted px-1 rounded">http://127.0.0.1:3847/callback</code>
                </li>
                <li>
                  Toujours dans Authentication → <strong>Flux clients publics autorisés</strong> : Oui
                </li>
                <li>
                  Permissions Graph déléguées :{" "}
                  <code className="bg-muted px-1 rounded">Files.ReadWrite</code>,{" "}
                  <code className="bg-muted px-1 rounded">User.Read</code>,{" "}
                  <code className="bg-muted px-1 rounded">offline_access</code>
                </li>
                <li>Copiez l&apos;Application (client) ID ci-dessous</li>
              </ol>
            </div>

            <div className="flex gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-xs text-amber-950">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                La permission <code className="font-mono">Files.ReadWrite</code> autorise
                techniquement l&apos;accès à tous les fichiers OneDrive de ce compte. Le CRM
                limite ses actions au dossier racine choisi, mais cette limite est applicative et
                non imposée par Microsoft.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="onedrive-ms-client-id">Client ID Microsoft (Azure)</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="onedrive-ms-client-id"
                  value={microsoftClientId}
                  onChange={(e) => setMicrosoftClientId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  autoComplete="off"
                  className="max-w-md font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={savingClientId || !microsoftClientId.trim()}
                  onClick={() => void handleSaveClientId()}
                >
                  {savingClientId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
                </Button>
              </div>
              {!clientIdReady ? (
                <p className="text-xs text-amber-700">
                  Obligatoire même si vous utilisez Gmail pour les mails.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status?.connected ? "default" : "secondary"}>
                {status?.connected ? "Connecté" : "Non connecté"}
              </Badge>
              {status?.email ? (
                <span className="text-sm text-muted-foreground">{status.email}</span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {!status?.connected ? (
                <Button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={connecting || !clientIdReady}
                >
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connecter OneDrive"}
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setRootPickerOpen(true)}>
                    <FolderOpen className="h-4 w-4 mr-1.5" />
                    Dossier racine clients
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setWizardOpen(true)}>
                    <Link2 className="h-4 w-4 mr-1.5" />
                    Rattacher les dossiers
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void handleDisconnect()}>
                    <Unplug className="h-4 w-4 mr-1.5" />
                    Déconnecter
                  </Button>
                </>
              )}
            </div>
            {status?.rootFolderName ? (
              <p className="text-sm text-muted-foreground">
                Racine cloud :{" "}
                <span className="text-foreground font-medium">{status.rootFolderName}</span>
              </p>
            ) : status?.connected ? (
              <p className="text-sm text-amber-700">
                Choisissez le dossier « Dossier clients » sur votre OneDrive.
              </p>
            ) : null}
            {status?.connected ? (
              <div className="rounded-xl border border-border/80 bg-muted/10 px-4 py-3 space-y-2">
                <p className="text-sm font-medium">Dossier OneDrive sur ce PC</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Pour ouvrir les dossiers clients dans l&apos;Explorateur Windows, indiquez soit la
                  racine OneDrive (<code className="bg-muted px-1 rounded">D:\OneDrive</code>), soit
                  directement votre dossier clients (
                  <code className="bg-muted px-1 rounded">D:\OneDrive\Dossier Clients PRODEMIAL</code>
                  ). Le CRM détecte aussi la variable Windows <code className="bg-muted px-1 rounded">OneDrive</code>.
                </p>
                {status.localSyncRoot ? (
                  <p className="text-xs font-mono text-foreground break-all">{status.localSyncRoot}</p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={savingLocalRoot}
                  onClick={() => void handlePickLocalSyncRoot()}
                >
                  {savingLocalRoot ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <HardDrive className="h-4 w-4" />
                  )}
                  Choisir le dossier OneDrive local
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </SettingsPanel>

      <Dialog open={rootPickerOpen} onOpenChange={setRootPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dossier racine clients</DialogTitle>
            <DialogDescription>
              Sélectionnez le dossier qui contient tous vos dossiers clients (ex. « Dossier clients »).
            </DialogDescription>
          </DialogHeader>
          <ClientOneDriveBrowsePanel
            pickFolderLabel="Définir comme racine"
            onPickFolder={(item) => {
              void (async () => {
                try {
                  await saveClientOneDriveRootFolder(item.id, item.name);
                  clearClientOneDriveBrowseCache();
                  await refresh();
                  setRootPickerOpen(false);
                  toast.success("Dossier racine enregistré");
                } catch (e) {
                  toast.error(invokeErrorMessage(e) || "Enregistrement impossible");
                }
              })();
            }}
          />
        </DialogContent>
      </Dialog>

      <ClientOneDriveLinkWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onUpdated={() => void refresh()}
      />
    </>
  );
}
