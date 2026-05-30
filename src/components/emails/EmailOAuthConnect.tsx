import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mail, Loader2, Unplug, TestTube, ExternalLink } from "lucide-react";
import {
  connectEmailOAuth,
  disconnectEmailOAuth,
  getEmailConnectionStatus,
  getOAuthAppSettings,
  saveOAuthAppSettings,
  testEmailConnection,
  type EmailConnectionStatus,
} from "@/lib/api/tauri-email-oauth";
import { toast } from "sonner";

type EmailOAuthConnectProps = {
  onOpenSmtp: () => void;
};

export function EmailOAuthConnect({ onOpenSmtp }: EmailOAuthConnectProps) {
  const [status, setStatus] = useState<EmailConnectionStatus | null>(null);
  const [googleClientId, setGoogleClientId] = useState("");
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<"google" | "microsoft" | null>(null);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [st, settings] = await Promise.all([
        getEmailConnectionStatus(),
        getOAuthAppSettings(),
      ]);
      setStatus(st);
      setGoogleClientId(settings.google_client_id ?? "");
      setMicrosoftClientId(settings.microsoft_client_id ?? "");
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger la connexion email");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSaveIds = async () => {
    try {
      await saveOAuthAppSettings({
        google_client_id: googleClientId.trim() || null,
        microsoft_client_id: microsoftClientId.trim() || null,
      });
      toast.success("Identifiants OAuth enregistrés");
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const handleConnect = async (provider: "google" | "microsoft") => {
    setConnecting(provider);
    try {
      await handleSaveIds();
      const st = await connectEmailOAuth(provider);
      setStatus(st);
      toast.success(`Connecté : ${st.email ?? "compte"}`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectEmailOAuth();
      await refresh();
      toast.success("Compte déconnecté");
    } catch {
      toast.error("Erreur lors de la déconnexion");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const msg = await testEmailConnection();
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const oauthConnected = status?.method === "oauth" && status.connected;
  const smtpOnly = status?.method === "smtp";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle>Connexion email (recommandé)</CardTitle>
        </div>
        <CardDescription>
          Connectez Gmail ou Outlook en un clic (OAuth). Les envois depuis Suivi → Envois nécessitent le
          CRM ouvert. Configuration : <code className="text-xs">docs/EMAIL_OAUTH_SETUP.md</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : (
          <>
            {oauthConnected && (
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                <Badge className="bg-green-100 text-green-800">Connecté</Badge>
                <span className="text-sm">
                  {status?.provider === "google" ? "Google" : "Microsoft"} — {status?.email}
                </span>
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => void handleDisconnect()}>
                  <Unplug className="h-4 w-4 mr-1" />
                  Déconnecter
                </Button>
              </div>
            )}
            {smtpOnly && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Méthode active : SMTP (avancé). Vous pouvez connecter OAuth ci-dessous pour simplifier
                l&apos;envoi.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="google-client-id">Client ID Google (Desktop)</Label>
                <Input
                  id="google-client-id"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ms-client-id">Client ID Microsoft (Application)</Label>
                <Input
                  id="ms-client-id"
                  value={microsoftClientId}
                  onChange={(e) => setMicrosoftClientId(e.target.value)}
                  placeholder="UUID Azure"
                />
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void handleSaveIds()}>
              Enregistrer les identifiants
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleConnect("google")}
                disabled={!!connecting || !googleClientId.trim()}
              >
                {connecting === "google" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Connecter Google
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleConnect("microsoft")}
                disabled={!!connecting || !microsoftClientId.trim()}
              >
                {connecting === "microsoft" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Connecter Microsoft
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleTest()}
                disabled={testing || !status?.connected}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <TestTube className="h-4 w-4 mr-2" />
                )}
                Tester la connexion
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Redirect URI à configurer dans Google Cloud / Azure :{" "}
              <code>http://127.0.0.1:3847/callback</code>
            </p>

            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onOpenSmtp}>
              Méthode avancée : configuration SMTP (mot de passe d&apos;application)
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
