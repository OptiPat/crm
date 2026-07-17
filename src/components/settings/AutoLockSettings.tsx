import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APP_RUNTIME_PREFS_CHANGED_EVENT,
  AUTO_LOCK_OPTIONS_MIN,
  DEFAULT_APP_RUNTIME_PREFS,
  getAppRuntimePrefs,
  saveAutoLockMinutes,
  type AppRuntimePrefs,
} from "@/lib/api/tauri-app-runtime";

function formatDelay(minutes: number): string {
  return minutes === 0 ? "Désactivé" : `${minutes} minutes`;
}

export function AutoLockSettings() {
  const [minutes, setMinutes] = useState(DEFAULT_APP_RUNTIME_PREFS.auto_lock_minutes);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handlePrefsChanged = (event: Event) => {
      const detail = (event as CustomEvent<AppRuntimePrefs>).detail;
      if (detail) setMinutes(detail.auto_lock_minutes);
    };
    window.addEventListener(APP_RUNTIME_PREFS_CHANGED_EVENT, handlePrefsChanged);
    void getAppRuntimePrefs()
      .then((prefs) => setMinutes(prefs.auto_lock_minutes))
      .catch((error) => toast.error(String(error)))
      .finally(() => setLoading(false));
    return () => window.removeEventListener(APP_RUNTIME_PREFS_CHANGED_EVENT, handlePrefsChanged);
  }, []);

  const updateDelay = async (value: string) => {
    const nextMinutes = Number(value);
    const previous = minutes;
    setMinutes(nextMinutes);
    setSaving(true);
    try {
      const saved = await saveAutoLockMinutes(nextMinutes);
      setMinutes(saved.auto_lock_minutes);
      toast.success(
        saved.auto_lock_minutes === 0
          ? "Verrouillage automatique désactivé"
          : `Verrouillage automatique réglé sur ${saved.auto_lock_minutes} minutes`,
      );
    } catch (error) {
      setMinutes(previous);
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
      <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="flex-1 space-y-3">
        <div>
          <Label htmlFor="auto-lock-delay" className="text-sm font-medium">
            Verrouillage automatique
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Masque le CRM après une période d’inactivité ou au retour d’une veille prolongée.
            Les automatisations autorisées continuent dans le tray.
          </p>
        </div>
        <Select
          value={String(minutes)}
          disabled={loading || saving}
          onValueChange={(value) => void updateDelay(value)}
        >
          <SelectTrigger id="auto-lock-delay" className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTO_LOCK_OPTIONS_MIN.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {formatDelay(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
