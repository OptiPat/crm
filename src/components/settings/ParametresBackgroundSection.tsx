import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import {
  APP_RUNTIME_PREFS_CHANGED_EVENT,
  DEFAULT_APP_RUNTIME_PREFS,
  getAppRuntimePrefs,
  quitAppFully,
  saveAppRuntimePrefs,
  type AppRuntimePrefs,
} from "@/lib/api/tauri-app-runtime";
import {
  formatAutomationJobStat,
  getAutomationJobStats,
} from "@/lib/background/background-automation-stats";
import {
  BOX_PLACEMENT_INTERVAL_OPTIONS_MIN,
  MAIL_SCAN_INTERVAL_OPTIONS_MIN,
  RELATION_INTERVAL_OPTIONS_MIN,
  formatMailScanIntervalLabel,
  formatRelationIntervalLabel,
} from "@/lib/background/background-automation-intervals";
import { testDesktopAutomationNotification } from "@/lib/background/background-automation-notify";
import { Bell, Monitor, Power } from "lucide-react";
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
  const prefsRef = useRef<AppRuntimePrefs>(DEFAULT_APP_RUNTIME_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingNotif, setTestingNotif] = useState(false);
  const [jobStats, setJobStats] = useState(() => getAutomationJobStats());

  useEffect(() => {
    const refreshStats = () => setJobStats(getAutomationJobStats());
    refreshStats();
    const id = window.setInterval(refreshStats, 10_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const handlePrefsChanged = (event: Event) => {
      const detail = (event as CustomEvent<AppRuntimePrefs>).detail;
      if (!detail) return;
      prefsRef.current = detail;
      setPrefs(detail);
    };
    window.addEventListener(APP_RUNTIME_PREFS_CHANGED_EVENT, handlePrefsChanged);
    return () => window.removeEventListener(APP_RUNTIME_PREFS_CHANGED_EVENT, handlePrefsChanged);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await getAppRuntimePrefs();
        prefsRef.current = loaded;
        setPrefs(loaded);
      } catch (e) {
        console.warn("Prefs arrière-plan:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const patch = useCallback(async (partial: Partial<AppRuntimePrefs>) => {
    const previous = prefsRef.current;
    const nextSnapshot = { ...previous, ...partial };
    prefsRef.current = nextSnapshot;
    setPrefs(nextSnapshot);
    setSaving(true);
    try {
      const saved = await saveAppRuntimePrefs(nextSnapshot);
      prefsRef.current = saved;
      setPrefs(saved);
    } catch (e) {
      toast.error(String(e));
      try {
        const loaded = await getAppRuntimePrefs();
        prefsRef.current = loaded;
        setPrefs(loaded);
      } catch {
        prefsRef.current = previous;
        setPrefs(previous);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const automationsDisabled = loading || saving || !prefs.background_automations;

  const relationStat = formatAutomationJobStat(jobStats.relation);
  const stelliumStat = formatAutomationJobStat(jobStats.stellium);
  const boxPlacementStat = formatAutomationJobStat(jobStats.box_placement);

  return (
    <SettingsPanel
      title="Arrière-plan & automatisations"
      description="Le CRM peut rester actif dans le tray pour sync mail, Stellium, Box Placement et rappels — sans envoi automatique des étiquettes."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <Monitor className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Fermer la fenêtre avec la croix cache le CRM dans la zone de notification (icône tray).
            Au retour sur le CRM, les syncs automatiques ne se relancent que si l&apos;intervalle
            choisi est écoulé (pas de scan complet à chaque re-clic).
            Utilisez <span className="font-medium">Quitter</span> ci-dessous ou le menu tray pour arrêter
            complètement l&apos;application.
          </p>
        </div>

        <div className="space-y-3">
          <AutomationToggle
            id="pref-foreground-automations"
            label="Sync auto fenêtre ouverte"
            description="Timers et retour focus (désactivable en RDV ; le tray reste indépendant)."
            checked={prefs.foreground_automations}
            disabled={loading || saving}
            onCheckedChange={(checked) => void patch({ foreground_automations: checked })}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border px-4 py-3 space-y-2">
              <Label htmlFor="pref-relation-interval" className="text-sm font-medium">
                Sync mail & agenda (fenêtre ouverte)
              </Label>
              <Select
                value={String(prefs.relation_interval_minutes)}
                disabled={loading || saving}
                onValueChange={(value) =>
                  void patch({ relation_interval_minutes: Number(value) })
                }
              >
                <SelectTrigger id="pref-relation-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATION_INTERVAL_OPTIONS_MIN.map((mins) => (
                    <SelectItem key={mins} value={String(mins)}>
                      {formatRelationIntervalLabel(mins)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {relationStat ? (
                <p className="text-xs text-muted-foreground">Dernière sync : {relationStat}</p>
              ) : null}
            </div>

            <div className="rounded-lg border px-4 py-3 space-y-2">
              <Label htmlFor="pref-stellium-interval" className="text-sm font-medium">
                Scan Stellium Exceltis
              </Label>
              <p className="text-xs text-muted-foreground">
                Mails remboursements (marketplacement@stellium.fr).
              </p>
              <Select
                value={String(prefs.stellium_interval_minutes)}
                disabled={loading || saving}
                onValueChange={(value) =>
                  void patch({ stellium_interval_minutes: Number(value) })
                }
              >
                <SelectTrigger id="pref-stellium-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAIL_SCAN_INTERVAL_OPTIONS_MIN.map((mins) => (
                    <SelectItem key={mins} value={String(mins)}>
                      {formatMailScanIntervalLabel(mins)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {stelliumStat ? (
                <p className="text-xs text-muted-foreground">Dernier scan : {stelliumStat}</p>
              ) : null}
            </div>

            <div className="rounded-lg border px-4 py-3 space-y-2 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="pref-box-interval" className="text-sm font-medium">
                Scan Box Placement
              </Label>
              <p className="text-xs text-muted-foreground">
                Conformité / instance partenaire (no-reply@stellium.fr).
              </p>
              <Select
                value={String(prefs.box_placement_interval_minutes)}
                disabled={loading || saving}
                onValueChange={(value) =>
                  void patch({ box_placement_interval_minutes: Number(value) })
                }
              >
                <SelectTrigger id="pref-box-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOX_PLACEMENT_INTERVAL_OPTIONS_MIN.map((mins) => (
                    <SelectItem key={mins} value={String(mins)}>
                      {formatMailScanIntervalLabel(mins)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {boxPlacementStat ? (
                <p className="text-xs text-muted-foreground">Dernier scan : {boxPlacementStat}</p>
              ) : null}
            </div>
          </div>

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
              description="Sync mail/agenda, Stellium, rappels RDV, anniversaires, point du jour (tray uniquement)."
            checked={prefs.background_automations}
            disabled={loading || saving}
            onCheckedChange={(checked) => void patch({ background_automations: checked })}
          />

          <div className="ml-2 pl-3 border-l space-y-3">
            <p className="text-xs text-muted-foreground px-1">
              Ci-dessous : tâches actives quand la fenêtre est cachée (tray). Les intervalles
              ci-dessus s&apos;appliquent aussi au tray (respect des délais, pas de forçage au focus).
            </p>
            <AutomationToggle
              id="pref-bg-relation"
              label="Sync mail & agenda"
              description="Réponses campagnes, RDV Google (intervalle configurable)."
              checked={prefs.background_relation_sync}
              disabled={automationsDisabled}
              onCheckedChange={(checked) => void patch({ background_relation_sync: checked })}
            />
            <AutomationToggle
              id="pref-bg-stellium"
              label="Scan Stellium Exceltis"
              description="Remboursements millésimes (Gmail ou Outlook ; inactif en mode Manuel uniquement)."
              checked={prefs.background_stellium_scan}
              disabled={automationsDisabled}
              onCheckedChange={(checked) => void patch({ background_stellium_scan: checked })}
            />
            <AutomationToggle
              id="pref-bg-box"
              label="Scan Box Placement"
              description="Conformité / instance partenaire (inactif en mode Manuel uniquement)."
              checked={prefs.background_box_placement_scan}
              disabled={automationsDisabled}
              onCheckedChange={(checked) =>
                void patch({ background_box_placement_scan: checked })
              }
            />
            <AutomationToggle
              id="pref-bg-rdv"
              label="Rappels RDV Pipe"
              description="Même intervalle que sync mail & agenda."
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

        <div className="rounded-lg border px-4 py-3 space-y-2">
          <div>
            <p className="text-sm font-medium">Notification bureau (test)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Envoie une notification système pour vérifier les permissions Windows / macOS.
              Sous Windows 10, vérifiez ensuite Paramètres → Actions et notifications → CRM W.Y.S.
              En développement (<code className="text-[11px]">dev.ps1</code>), l&apos;expéditeur peut
              apparaître sous Windows PowerShell. Les anniversaires et le point du jour partent en
              bannière Windows lorsque le CRM est fermé dans le tray (✕).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={testingNotif}
            onClick={() => {
              setTestingNotif(true);
              void testDesktopAutomationNotification()
                .then((sent) => {
                  if (sent) {
                    toast.success(
                      "Notification envoyée — vérifiez la bannière Windows ou le Centre de notifications."
                    );
                  }
                })
                .catch((e) => toast.error(String(e)))
                .finally(() => setTestingNotif(false));
            }}
          >
            <Bell className="h-4 w-4 mr-1.5" />
            {testingNotif ? "Envoi…" : "Tester la notification bureau"}
          </Button>
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
