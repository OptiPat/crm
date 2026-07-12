import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import {
  DEFAULT_APP_RUNTIME_PREFS,
  getAppRuntimePrefs,
  quitAppFully,
  saveAppRuntimePrefs,
  type AppRuntimePrefs,
} from "@/lib/api/tauri-app-runtime";
import { Monitor, Power } from "lucide-react";
import { toast } from "sonner";

export function ParametresBackgroundSection() {
  const [prefs, setPrefs] = useState<AppRuntimePrefs>(DEFAULT_APP_RUNTIME_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setPrefs(await getAppRuntimePrefs());
      } catch (e) {
        console.warn("Prefs arrière-plan:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const patch = useCallback(async (partial: Partial<AppRuntimePrefs>) => {
    let nextSnapshot: AppRuntimePrefs | null = null;
    setPrefs((prev) => {
      nextSnapshot = { ...prev, ...partial };
      return nextSnapshot;
    });
    if (!nextSnapshot) return;
    setSaving(true);
    try {
      await saveAppRuntimePrefs(nextSnapshot);
    } catch (e) {
      toast.error(String(e));
      try {
        setPrefs(await getAppRuntimePrefs());
      } catch {
        /* ignore reload failure */
      }
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <SettingsPanel
      title="Arrière-plan & rappels RDV"
      description="Le CRM peut rester actif dans la barre des tâches pour envoyer les rappels email RDV Pipe."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <Monitor className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Fermer la fenêtre avec la croix cache le CRM dans la zone de notification (icône tray).
            Utilisez <span className="font-medium">Quitter</span> ci-dessous ou le menu de
            l&apos;icône tray pour arrêter complètement l&apos;application.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div>
              <Label htmlFor="pref-close-tray" className="text-sm font-medium">
                Fermer = rester en arrière-plan
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recommandé pour les rappels RDV automatiques.
              </p>
            </div>
            <Switch
              id="pref-close-tray"
              checked={prefs.close_to_tray}
              disabled={loading || saving}
              onCheckedChange={(checked) => void patch({ close_to_tray: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div>
              <Label htmlFor="pref-autostart" className="text-sm font-medium">
                Lancer au démarrage de Windows
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Démarre minimisé dans le tray (déverrouillage manuel le matin).
              </p>
            </div>
            <Switch
              id="pref-autostart"
              checked={prefs.launch_at_startup}
              disabled={loading || saving}
              onCheckedChange={(checked) => void patch({ launch_at_startup: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div>
              <Label htmlFor="pref-bg-rdv" className="text-sm font-medium">
                Rappels RDV Pipe en arrière-plan
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vérification toutes les 3 min tant que l&apos;app tourne (tray).
              </p>
            </div>
            <Switch
              id="pref-bg-rdv"
              checked={prefs.background_pipe_rdv_reminders}
              disabled={loading || saving}
              onCheckedChange={(checked) =>
                void patch({ background_pipe_rdv_reminders: checked })
              }
            />
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (
              !window.confirm(
                "Quitter complètement Patrimoine CRM ? Les rappels automatiques s'arrêteront."
              )
            ) {
              return;
            }
            void quitAppFully().catch((e) => toast.error(String(e)));
          }}
        >
          <Power className="h-4 w-4 mr-1.5" />
          Quitter complètement Patrimoine CRM
        </Button>
      </div>
    </SettingsPanel>
  );
}
