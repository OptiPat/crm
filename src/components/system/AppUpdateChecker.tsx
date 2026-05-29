import { useEffect, useRef, useState } from "react";
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

interface AppUpdateCheckerProps {
  /** Vérification automatique au démarrage (release uniquement). */
  autoCheck?: boolean;
}

export function AppUpdateChecker({ autoCheck = true }: AppUpdateCheckerProps) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const checkedRef = useRef(false);

  const runCheck = async (silent = false) => {
    try {
      const found = await check();
      if (found) {
        setUpdate(found);
        setOpen(true);
        if (!silent) {
          toast.info(`Mise à jour ${found.version} disponible`);
        }
      } else if (!silent) {
        toast.success("Vous utilisez la dernière version");
      }
    } catch (error) {
      console.error("Vérification MAJ:", error);
      if (!silent) {
        toast.error("Impossible de vérifier les mises à jour");
      }
    }
  };

  useEffect(() => {
    if (!autoCheck || checkedRef.current) return;
    checkedRef.current = true;

    const isDev = import.meta.env.DEV;
    if (isDev) return;

    const timer = setTimeout(() => runCheck(true), 3000);
    return () => clearTimeout(timer);
  }, [autoCheck]);

  const handleInstall = async () => {
    if (!update) return;
    setInstalling(true);
    setProgress(0);
    try {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
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
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mise à jour disponible</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Version <strong>{update?.version}</strong> disponible.
              </p>
              {update?.body ? (
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs max-h-40 overflow-y-auto">
                  {update.body}
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
          <AlertDialogAction onClick={handleInstall} disabled={installing}>
            {installing ? "Installation…" : "Installer maintenant"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Bouton manuel pour Paramètres */
export function CheckForUpdatesButton() {
  const [checking, setChecking] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>("…");

  useEffect(() => {
    getVersion().then(setCurrentVersion).catch(() => setCurrentVersion("?"));
  }, []);

  const handleClick = async () => {
    if (import.meta.env.DEV) {
      toast.message("Les mises à jour auto sont désactivées en mode développement");
      return;
    }
    setChecking(true);
    try {
      const found = await check();
      if (found) {
        toast.info(`Version ${found.version} disponible — redémarrez l'app pour voir la proposition d'installation`, {
          duration: 8000,
        });
        // Déclencher le dialog global via re-check : on recharge la page ou on duplique le dialog
        // Pour simplifier, on propose d'installer directement ici aussi
        if (confirm(`Installer la version ${found.version} maintenant ?\n\nVos données ne seront pas supprimées.`)) {
          await found.downloadAndInstall(() => {});
          await relaunch();
        }
      } else {
        toast.success(`Version ${currentVersion} — aucune mise à jour`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Vérification impossible (réseau ou releases non configurées)");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-muted-foreground">Version installée : {currentVersion}</span>
      <button
        type="button"
        className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
        onClick={handleClick}
        disabled={checking}
      >
        {checking ? "Vérification…" : "Rechercher une mise à jour"}
      </button>
    </div>
  );
}
