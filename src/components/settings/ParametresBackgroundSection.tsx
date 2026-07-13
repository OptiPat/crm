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

function AutomationToggle({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

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

  const automationsDisabled = loading || saving || !prefs.background_automations;

  return (
    <SettingsPanel
      title="Arrière-plan & automatisations"
      description="Le CRM peut rester actif dans le tray pour sync mail, Stellium, notes et rappels — sans envoi automatique des étiquettes."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <Monitor className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Fermer la fenêtre avec la croix cache le CRM dans la zone de notification (icône tray).
            Les événements importants déclenchent une notification bureau (Windows / macOS).
            Utilisez <span className="font-medium">Quitter</span> ci-dessous ou le menu tray pour arrêter
            complètement l&apos;application.
          </p>
        </div>

        <div className="space-y-3">
          <AutomationToggle
            id="pref-close-tray"
            label="Fermer = rester en arrière-plan"
            description="Recommandé pour les automatisations tray."
            checked={prefs.close_to_tray}
            disabled={loading || saving}
            onCheckedChange={(checked) => void patch({ close_to_tray: checked })}
          />

          <AutomationToggle
            id="pref-autostart"
              label="Lancer au démarrage du système"
              description="Démarre minimisé dans le tray (version installée uniquement — pas dev.ps1)."
            checked={prefs.launch_at_startup}
            disabled={loading || saving}
            onCheckedChange={(checked) => void patch({ launch_at_startup: checked })}
          />

          <AutomationToggle
            id="pref-bg-master"
            label="Automatisations en arrière-plan"
              description="Sync mail/agenda, Stellium, notes, rappels RDV, anniversaires, point du jour (tray uniquement)."
            checked={prefs.background_automations}
            disabled={loading || saving}
            onCheckedChange={(checked) => void patch({ background_automations: checked })}
          />

          <div className="ml-2 pl-3 border-l space-y-3">
            <p className="text-xs text-muted-foreground px-1">
              Ci-dessous : tâches actives quand la fenêtre est cachée (tray). La fenêtre
              ouverte continue de synchroniser normalement.
            </p>
            <AutomationToggle
              id="pref-bg-relation"
              label="Sync mail & agenda"
              description="Réponses campagnes, RDV Google (3 min)."
              checked={prefs.background_relation_sync}
              disabled={automationsDisabled}
              onCheckedChange={(checked) => void patch({ background_relation_sync: checked })}
            />
            <AutomationToggle
              id="pref-bg-stellium"
              label="Scan Stellium Exceltis"
              description="Détection remboursements (~1 h)."
              checked={prefs.background_stellium_scan}
              disabled={automationsDisabled}
              onCheckedChange={(checked) => void patch({ background_stellium_scan: checked })}
            />
            <AutomationToggle
              id="pref-bg-notes"
              label="Notes partagées"
              description="Synchronisation (~5 min)."
              checked={prefs.background_notes_sync}
              disabled={automationsDisabled}
              onCheckedChange={(checked) => void patch({ background_notes_sync: checked })}
            />
            <AutomationToggle
              id="pref-bg-rdv"
              label="Rappels RDV Pipe"
              description="Emails de rappel planifiés (3 min)."
              checked={prefs.background_pipe_rdv_reminders}
              disabled={automationsDisabled}
              onCheckedChange={(checked) =>
                void patch({ background_pipe_rdv_reminders: checked })
              }
            />
            <AutomationToggle
              id="pref-bg-birthdays"
              label="Anniversaires du jour"
              description="Notification « Anniversaire de X » (1× par jour)."
              checked={prefs.background_birthday_notifications}
              disabled={automationsDisabled}
              onCheckedChange={(checked) =>
                void patch({ background_birthday_notifications: checked })
              }
            />
            <AutomationToggle
              id="pref-bg-tray-digest"
              label="Point du jour (tray)"
              description="Une seule notif regroupée (~1 h) : RDV Pipe dans 2 h, alertes Suivi, tâches, emails prêts."
              checked={prefs.background_tray_digest}
              disabled={automationsDisabled}
              onCheckedChange={(checked) => void patch({ background_tray_digest: checked })}
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
                "Quitter complètement Patrimoine CRM ? Les automatisations s'arrêteront."
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
