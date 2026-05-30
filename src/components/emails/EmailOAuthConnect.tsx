import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import {
  Mail,
  Loader2,
  Unplug,
  TestTube,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import {
  connectEmailOAuth,
  disconnectEmailOAuth,
  getEmailConnectionStatus,
  getOAuthAppSettings,
  saveOAuthAppSettings,
  testEmailConnection,
  type EmailConnectionStatus,
} from "@/lib/api/tauri-email-oauth";
import { deleteSmtpConfig } from "@/lib/api/tauri-email";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type EmailOAuthConnectProps = {
  variant?: "card" | "embedded";
};

export function EmailOAuthConnect({ variant = "card" }: EmailOAuthConnectProps) {
  const [status, setStatus] = useState<EmailConnectionStatus | null>(null);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleSecretConfigured, setGoogleSecretConfigured] = useState(false);
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<"google" | "microsoft" | null>(null);
  const [testing, setTesting] = useState(false);
  const [removingSmtp, setRemovingSmtp] = useState(false);
  const [showReplaceGoogleSecret, setShowReplaceGoogleSecret] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [st, settings] = await Promise.all([
        getEmailConnectionStatus(),
        getOAuthAppSettings(),
      ]);
      setStatus(st);
      setGoogleClientId(settings.google_client_id ?? "");
      setGoogleSecretConfigured(settings.google_client_secret_configured);
      setMicrosoftClientId(settings.microsoft_client_id ?? "");
      setShowReplaceGoogleSecret(false);
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
      const secretTrimmed = googleClientSecret.trim();
      await saveOAuthAppSettings({
        google_client_id: googleClientId.trim() || null,
        google_client_secret: secretTrimmed ? secretTrimmed : undefined,
        microsoft_client_id: microsoftClientId.trim() || null,
      });
      if (secretTrimmed) {
        setGoogleSecretConfigured(true);
        setGoogleClientSecret("");
        setShowReplaceGoogleSecret(false);
      }
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

  const handleRemoveLegacySmtp = async () => {
    setRemovingSmtp(true);
    try {
      await deleteSmtpConfig();
      await refresh();
      toast.success("Ancienne configuration SMTP supprimée");
    } catch {
      toast.error("Impossible de supprimer la config SMTP");
    } finally {
      setRemovingSmtp(false);
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
  const legacySmtp = status?.method === "smtp";

  const body = loading ? (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Chargement de la connexion…
    </div>
  ) : (
    <div className="space-y-5">
      {legacySmtp && (
        <div className="text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <p>
            Une ancienne configuration SMTP bloque l&apos;usage de Gmail dans Suivi → Envois.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={removingSmtp}
            onClick={() => void handleRemoveLegacySmtp()}
          >
            {removingSmtp ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Supprimer l&apos;ancienne config SMTP
          </Button>
        </div>
      )}

      {oauthConnected ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-emerald-950">Boîte connectée</p>
              <p className="text-sm text-emerald-800/90 truncate">
                {status?.provider === "google" ? "Google" : "Microsoft"} — {status?.email}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Prêt pour Suivi → Envois (CRM ouvert pendant l&apos;envoi)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => void handleTest()} disabled={testing}>
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-1" />
              )}
              Tester
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleDisconnect()}>
              <Unplug className="h-4 w-4 mr-1" />
              Déconnecter
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={
              !!connecting ||
              !googleClientId.trim() ||
              (!googleSecretConfigured && !googleClientSecret.trim())
            }
            onClick={() => void handleConnect("google")}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all",
              "hover:border-primary/50 hover:bg-muted/30 disabled:opacity-50 disabled:pointer-events-none",
              connecting === "google" ? "border-primary bg-primary/5" : "border-border"
            )}
          >
            <span className="text-sm font-semibold">Google / Gmail</span>
            <span className="text-xs text-muted-foreground">Recommandé pour l&apos;import de signature</span>
            {connecting === "google" ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <ExternalLink className="h-4 w-4 text-primary" />
            )}
          </button>
          <button
            type="button"
            disabled={!!connecting || !microsoftClientId.trim()}
            onClick={() => void handleConnect("microsoft")}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all",
              "hover:border-primary/50 hover:bg-muted/30 disabled:opacity-50 disabled:pointer-events-none",
              connecting === "microsoft" ? "border-primary bg-primary/5" : "border-border"
            )}
          >
            <span className="text-sm font-semibold">Microsoft / Outlook</span>
            <span className="text-xs text-muted-foreground">Client ID Azure requis</span>
            {connecting === "microsoft" ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <ExternalLink className="h-4 w-4 text-primary" />
            )}
          </button>
        </div>
      )}

      <details className="group rounded-xl border border-border/80 bg-muted/20 open:bg-muted/30">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/40 rounded-xl [&::-webkit-details-marker]:hidden">
          <span>Configuration OAuth avancée</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 space-y-4 border-t border-border/60 pt-4">
          <div className="space-y-2">
            <Label htmlFor="google-client-id">Client ID Google</Label>
            <Input
              id="google-client-id"
              value={googleClientId}
              onChange={(e) => setGoogleClientId(e.target.value)}
              placeholder="xxxx.apps.googleusercontent.com"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google-client-secret">Code secret client Google</Label>
            {googleSecretConfigured && !showReplaceGoogleSecret ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-emerald-950">Secret enregistré sur cet ordinateur</p>
                    <p className="text-xs text-emerald-900/85 mt-1 leading-relaxed">
                      Il est conservé localement dans la base du CRM. Vous n&apos;avez{" "}
                      <strong>pas besoin</strong> de le resaisir à chaque utilisation — uniquement si vous en
                      créez un nouveau dans Google Cloud ou changez de poste.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-emerald-300 bg-white/80"
                  onClick={() => setShowReplaceGoogleSecret(true)}
                >
                  Remplacer le secret
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="google-client-secret"
                  type="password"
                  value={googleClientSecret}
                  onChange={(e) => setGoogleClientSecret(e.target.value)}
                  placeholder="Collez le code secret depuis Google Cloud"
                  autoComplete="new-password"
                />
                {googleSecretConfigured && showReplaceGoogleSecret && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto py-0 text-xs"
                    onClick={() => {
                      setShowReplaceGoogleSecret(false);
                      setGoogleClientSecret("");
                    }}
                  >
                    Annuler le remplacement
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ms-client-id">Client ID Microsoft</Label>
            <Input
              id="ms-client-id"
              value={microsoftClientId}
              onChange={(e) => setMicrosoftClientId(e.target.value)}
              placeholder="UUID Azure"
              autoComplete="off"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => void handleSaveIds()}>
            Enregistrer les identifiants
          </Button>
          <p className="text-xs text-muted-foreground">
            Redirect URI : <code className="bg-muted px-1 rounded">http://127.0.0.1:3847/callback</code>
            {" · "}
            Guide <code className="bg-muted px-1 rounded">docs/EMAIL_OAUTH_SETUP.md</code>
          </p>
        </div>
      </details>

      {!oauthConnected && variant === "card" && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void handleConnect("google")}
            disabled={
              !!connecting ||
              !googleClientId.trim() ||
              (!googleSecretConfigured && !googleClientSecret.trim())
            }
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
        </div>
      )}
    </div>
  );

  if (variant === "embedded") {
    return (
      <SettingsPanel
        title="Connexion boîte mail"
        description="OAuth Gmail ou Outlook — requis pour les envois depuis Suivi."
        action={
          oauthConnected ? (
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal">
              Connecté
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal text-amber-700 border-amber-300">
              À configurer
            </Badge>
          )
        }
      >
        {body}
      </SettingsPanel>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle>Connexion email</CardTitle>
          {oauthConnected && (
            <Badge variant="secondary" className="font-normal">
              {status?.provider === "google" ? "Google" : "Microsoft"} — {status?.email}
            </Badge>
          )}
        </div>
        <CardDescription>
          Connectez votre boîte Gmail ou Outlook (OAuth). Guide :{" "}
          <code className="text-xs">docs/EMAIL_OAUTH_SETUP.md</code>
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
