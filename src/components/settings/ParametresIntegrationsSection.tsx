import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import {
  getLocalApiSettings,
  regenerateLocalApiToken,
  saveLocalApiSettings,
  type LocalApiSettings,
} from "@/lib/api/tauri-local-api";
import { Copy, RefreshCw, Workflow } from "lucide-react";
import { toast } from "sonner";

export function ParametresIntegrationsSection() {
  const [settings, setSettings] = useState<LocalApiSettings | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [port, setPort] = useState("3001");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLocalApiSettings();
      setSettings(data);
      setEnabled(data.enabled);
      setPort(String(data.port));
    } catch (error) {
      console.error(error);
      toast.error("Impossible de charger l'intégration n8n.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value.trim());
      toast.success(`${label} copié.`);
    } catch {
      toast.error("Copie impossible.");
    }
  };

  const handleSave = async () => {
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      toast.error("Port invalide.");
      return;
    }
    setSaving(true);
    try {
      const data = await saveLocalApiSettings(enabled, parsedPort);
      setSettings(data);
      toast.success("Intégration n8n enregistrée.");
    } catch (error) {
      console.error(error);
      toast.error("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateToken = async () => {
    setSaving(true);
    try {
      const data = await regenerateLocalApiToken();
      setSettings(data);
      toast.success("Nouveau token généré. Mettez à jour n8n si besoin.");
    } catch (error) {
      console.error(error);
      toast.error("Régénération impossible.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SettingsPanel title="Intégration n8n" description="Chargement…">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </SettingsPanel>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanel
        title="Intégration n8n"
        description="API locale pour n8n (anniversaires, campagnes SCPI). Le CRM doit être ouvert et déverrouillé."
        action={
          <Workflow className="h-5 w-5 text-muted-foreground" aria-hidden />
        }
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
            <div>
              <p className="text-sm font-medium">Activer l&apos;API locale</p>
              <p className="text-xs text-muted-foreground">
                Port par défaut 3001 — accessible depuis n8n Docker via host.docker.internal
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid gap-2 max-w-xs">
            <Label htmlFor="local-api-port">Port</Label>
            <Input
              id="local-api-port"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </div>

          {settings ? (
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label>URL anniversaires (n8n Docker)</Label>
                <div className="flex gap-2">
                  <Input readOnly value={settings.birthdaysUrl} />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => void copy(settings.birthdaysUrl, "URL")}
                    aria-label="Copier l'URL"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>URL campagnes SCPI (POST, n8n Docker)</Label>
                <div className="flex gap-2">
                  <Input readOnly value={settings.scpiCampaignsUrl} />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => void copy(settings.scpiCampaignsUrl, "URL SCPI")}
                    aria-label="Copier l'URL SCPI"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Token (header Authorization: Bearer …)</Label>
                <div className="flex gap-2">
                  <Input readOnly value={settings.token} className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => void copy(settings.token, "Token")}
                    aria-label="Copier le token"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => void handleRegenerateToken()}
                    disabled={saving}
                    aria-label="Régénérer le token"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Bulletins SCPI : après le workflow n8n, les mails digest apparaissent dans Suivi → Envois
            (modèle « Bulletin SCPI trimestriel »). Anniversaires : Telegram = rappel CGP uniquement.
          </p>

          <Button onClick={() => void handleSave()} disabled={saving}>
            Enregistrer
          </Button>
        </div>
      </SettingsPanel>
    </div>
  );
}
