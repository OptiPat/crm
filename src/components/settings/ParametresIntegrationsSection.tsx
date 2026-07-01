import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import {
  getBirthdayTelegramSettings,
  saveBirthdayTelegramSettings,
  sendBirthdayTelegramRemindersNow,
  testBirthdayTelegram,
  type BirthdayTelegramSettings,
} from "@/lib/api/tauri-birthday-telegram";
import {
  getLocalApiSettings,
  regenerateLocalApiToken,
  saveLocalApiSettings,
  type LocalApiSettings,
} from "@/lib/api/tauri-local-api";
import { Copy, MessageCircle, RefreshCw, Workflow } from "lucide-react";
import { toast } from "sonner";

export function ParametresIntegrationsSection() {
  const [settings, setSettings] = useState<LocalApiSettings | null>(null);
  const [birthdaySettings, setBirthdaySettings] = useState<BirthdayTelegramSettings | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [port, setPort] = useState("3001");
  const [birthdayEnabled, setBirthdayEnabled] = useState(false);
  const [birthdayChatId, setBirthdayChatId] = useState("");
  const [birthdayBotToken, setBirthdayBotToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBirthday, setSavingBirthday] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, birthday] = await Promise.all([
        getLocalApiSettings(),
        getBirthdayTelegramSettings(),
      ]);
      setSettings(data);
      setEnabled(data.enabled);
      setPort(String(data.port));
      setBirthdaySettings(birthday);
      setBirthdayEnabled(birthday.enabled);
      setBirthdayChatId(birthday.chatId);
      setBirthdayBotToken("");
    } catch (error) {
      console.error(error);
      toast.error("Impossible de charger les intégrations.");
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
      toast.success("API locale enregistrée.");
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

  const handleSaveBirthday = async () => {
    setSavingBirthday(true);
    try {
      const data = await saveBirthdayTelegramSettings(
        birthdayEnabled,
        birthdayChatId.trim(),
        birthdayBotToken.trim() || undefined
      );
      setBirthdaySettings(data);
      setBirthdayBotToken("");
      toast.success("Telegram anniversaires enregistré.");
    } catch (error) {
      console.error(error);
      toast.error("Enregistrement impossible.");
    } finally {
      setSavingBirthday(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      await testBirthdayTelegram();
      toast.success("Message test envoyé sur Telegram.");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Test Telegram impossible."
      );
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleSendRemindersNow = async () => {
    setSendingReminders(true);
    try {
      const result = await sendBirthdayTelegramRemindersNow();
      if (result.messagesSent === 0) {
        toast.message("Aucun anniversaire aujourd'hui.", {
          description: "Vérifiez le Dashboard ou la date de naissance du contact.",
        });
        return;
      }
      toast.success(
        `${result.messagesSent} rappel${result.messagesSent > 1 ? "s" : ""} envoyé${result.messagesSent > 1 ? "s" : ""} sur Telegram.`
      );
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Envoi impossible."
      );
    } finally {
      setSendingReminders(false);
    }
  };

  if (loading) {
    return (
      <SettingsPanel title="Intégrations" description="Chargement…">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </SettingsPanel>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanel
        title="API locale"
        description="HTTP locale pour intégrations externes legacy (n8n). Les anniversaires natifs se déclenchent à l'ouverture du CRM si Telegram est configuré ci-dessous."
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
            Bulletins SCPI : bouton <strong>Préparer</strong> dans Suivi → Envois (OCR + résumé
            Mistral intégrés). Clé Mistral : Paramètres → Newsletter.
          </p>

          <Button onClick={() => void handleSave()} disabled={saving}>
            Enregistrer
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Anniversaires — Telegram"
        description="Rappel à l'ouverture du CRM : un message Telegram par contact anniversaire. Sans Telegram, les anniversaires restent visibles sur le Dashboard."
        action={
          <MessageCircle className="h-5 w-5 text-muted-foreground" aria-hidden />
        }
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
            <div>
              <p className="text-sm font-medium">Activer les rappels Telegram</p>
              <p className="text-xs text-muted-foreground">
                Une notification par contact, max une fois par jour calendaire
              </p>
            </div>
            <Switch checked={birthdayEnabled} onCheckedChange={setBirthdayEnabled} />
          </div>

          <div className="grid gap-2 max-w-md">
            <Label htmlFor="birthday-telegram-chat-id">Chat ID Telegram</Label>
            <Input
              id="birthday-telegram-chat-id"
              value={birthdayChatId}
              onChange={(e) => setBirthdayChatId(e.target.value)}
              placeholder="8003147252"
              className="font-mono text-sm"
            />
          </div>

          <div className="grid gap-2 max-w-md">
            <Label htmlFor="birthday-telegram-bot-token">
              Token du bot
              {birthdaySettings?.botTokenConfigured ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (configuré — laisser vide pour conserver)
                </span>
              ) : null}
            </Label>
            <Input
              id="birthday-telegram-bot-token"
              type="password"
              autoComplete="off"
              value={birthdayBotToken}
              onChange={(e) => setBirthdayBotToken(e.target.value)}
              placeholder="123456789:ABC…"
              className="font-mono text-sm"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Créez un bot via @BotFather, récupérez le token et votre chat ID (@userinfobot).
            Envoyez <strong>/start</strong> au bot avant le premier test.
            Désactivez le workflow n8n « Anniversaires » une fois cette intégration validée.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleSaveBirthday()} disabled={savingBirthday}>
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleTestTelegram()}
              disabled={testingTelegram || sendingReminders}
            >
              Tester Telegram
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSendRemindersNow()}
              disabled={sendingReminders || testingTelegram}
            >
              Envoyer les rappels du jour
            </Button>
          </div>
        </div>
      </SettingsPanel>
    </div>
  );
}
