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
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { ClientOneDriveSettingsPanel } from "@/components/client-onedrive/ClientOneDriveSettingsPanel";
import { TeamWorkspaceSettingsPanel } from "@/components/settings/TeamWorkspaceSettingsPanel";
import { userErrorMessage } from "@/lib/api/invoke-error";

export function ParametresIntegrationsSection() {
  const [birthdaySettings, setBirthdaySettings] = useState<BirthdayTelegramSettings | null>(null);
  const [birthdayEnabled, setBirthdayEnabled] = useState(false);
  const [birthdayChatId, setBirthdayChatId] = useState("");
  const [birthdayBotToken, setBirthdayBotToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingBirthday, setSavingBirthday] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const birthday = await getBirthdayTelegramSettings();
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
        userErrorMessage(error, "Test Telegram impossible.")
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
        userErrorMessage(error, "Envoi impossible.")
      );
    } finally {
      setSendingReminders(false);
    }
  };

  if (loading) {
    return (
      <SettingsPanel title="Équipe & intégrations" description="Chargement…">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </SettingsPanel>
    );
  }

  return (
    <div className="space-y-6">
      <TeamWorkspaceSettingsPanel />
      <ClientOneDriveSettingsPanel />
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
            <Label htmlFor="birthday-telegram-chat-id">
              Identifiant de votre conversation{" "}
              <span className="text-xs font-normal text-muted-foreground">(Chat ID)</span>
            </Label>
            <Input
              id="birthday-telegram-chat-id"
              value={birthdayChatId}
              onChange={(e) => setBirthdayChatId(e.target.value)}
              placeholder="8003147252"
              className="font-mono text-sm"
              aria-describedby="birthday-telegram-chat-id-help"
            />
            <p id="birthday-telegram-chat-id-help" className="text-xs text-muted-foreground">
              Un nombre qui désigne votre compte Telegram : envoyez un message à @userinfobot,
              il vous le répond.
            </p>
          </div>

          <div className="grid gap-2 max-w-md">
            <Label htmlFor="birthday-telegram-bot-token">
              Code secret du bot{" "}
              <span className="text-xs font-normal text-muted-foreground">(appelé « token » dans Telegram)</span>
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
              aria-describedby="birthday-telegram-bot-token-help"
            />
            <p id="birthday-telegram-bot-token-help" className="text-xs text-muted-foreground">
              Fourni par @BotFather quand vous créez votre bot (le « robot » Telegram qui vous
              enverra les rappels). Gardez-le pour vous.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Envoyez <strong>/start</strong> à votre bot avant le premier test, sinon Telegram
            refuse de lui transmettre les messages.
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
