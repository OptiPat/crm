import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { toast } from "sonner";
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

interface AppUpdateContextValue {
  pendingUpdate: Update | null;
  installing: boolean;
  progress: number;
  currentVersion: string;
  checkForUpdates: (options?: { silent?: boolean }) => Promise<boolean>;
  openInstallDialog: () => void;
  installUpdate: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function useAppUpdate() {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) {
    throw new Error("useAppUpdate doit être utilisé dans AppUpdateProvider");
  }
  return ctx;
}

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentVersion, setCurrentVersion] = useState("…");
  const startupCheckedRef = useRef(false);

  useEffect(() => {
    getVersion().then(setCurrentVersion).catch(() => setCurrentVersion("?"));
  }, []);

  const notifyUpdateAvailable = useCallback((found: Update, silent: boolean) => {
    setPendingUpdate(found);
    setDialogOpen(true);
    if (!silent) {
      toast.info(`Nouvelle version ${found.version} disponible`);
    } else {
      toast.info(`Nouvelle version ${found.version} — cliquez « Mettre à jour » en haut de l'écran`, {
        duration: 10000,
      });
    }
  }, []);

  const checkForUpdates = useCallback(
    async (options?: { silent?: boolean }): Promise<boolean> => {
      const silent = options?.silent ?? false;
      if (import.meta.env.DEV) {
        if (!silent) {
          toast.message("Mises à jour désactivées en mode développement");
        }
        return false;
      }
      try {
        const found = await check();
        if (found) {
          notifyUpdateAvailable(found, silent);
          return true;
        }
        if (!silent) {
          toast.success(`Version ${currentVersion} — aucune mise à jour`);
        }
        return false;
      } catch (error) {
        console.error("Vérification MAJ:", error);
        if (!silent) {
          const detail = error instanceof Error ? error.message : String(error);
          toast.error(`Impossible de vérifier les mises à jour : ${detail}`);
        }
        return false;
      }
    },
    [currentVersion, notifyUpdateAvailable],
  );

  const installUpdate = useCallback(async () => {
    if (!pendingUpdate) return;
    setInstalling(true);
    setProgress(0);
    try {
      let downloaded = 0;
      let total = 0;
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            setProgress(Math.min(100, Math.round((downloaded / total) * 100)));
          }
        }
      });
      toast.success("Mise à jour installée, redémarrage…");
      await relaunch();
    } catch (error) {
      console.error("Installation MAJ:", error);
      toast.error("Échec de la mise à jour");
      setInstalling(false);
    }
  }, [pendingUpdate]);

  const openInstallDialog = useCallback(() => {
    if (pendingUpdate) setDialogOpen(true);
  }, [pendingUpdate]);

  useEffect(() => {
    if (startupCheckedRef.current || import.meta.env.DEV) return;
    startupCheckedRef.current = true;
    const timer = setTimeout(() => checkForUpdates({ silent: true }), 3000);
    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  const value: AppUpdateContextValue = {
    pendingUpdate,
    installing,
    progress,
    currentVersion,
    checkForUpdates,
    openInstallDialog,
    installUpdate,
  };

  return (
    <AppUpdateContext.Provider value={value}>
      {children}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nouvelle version disponible</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Version <strong>{pendingUpdate?.version}</strong> prête à installer.
                  Un clic suffit — pas besoin de télécharger sur GitHub.
                </p>
                {pendingUpdate?.body ? (
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">
                    {pendingUpdate.body}
                  </pre>
                ) : (
                  <p>Vos données locales ne seront pas modifiées.</p>
                )}
                {installing && (
                  <div className="space-y-1 pt-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs">Téléchargement… {progress}%</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={installing}>Plus tard</AlertDialogCancel>
            <AlertDialogAction onClick={installUpdate} disabled={installing}>
              {installing ? "Installation…" : "Installer maintenant"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppUpdateContext.Provider>
  );
}
