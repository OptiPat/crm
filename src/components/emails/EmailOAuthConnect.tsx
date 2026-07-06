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
  connectGoogleCalendarOAuth,
  disconnectEmailOAuth,
  disconnectGoogleCalendarOAuth,
  getEmailConnectionStatus,
  getOAuthAppSettings,
  saveOAuthAppSettings,
  testEmailConnection,
  type EmailConnectionStatus,
} from "@/lib/api/tauri-email-oauth";
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
  const [connecting, setConnecting] = useState<"google" | "microsoft" | "google_calendar" | null>(null);
  const [testing, setTesting] = useState(false);
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

  const handleConnect = async (
    provider: "google" | "microsoft" | "google_calendar",
    options?: { forceConsent?: boolean }
  ) => {
    setConnecting(provider);
    try {
      await handleSaveIds();
      const st =
        provider === "google_calendar"
          ? await connectGoogleCalendarOAuth(options)
          : await connectEmailOAuth(provider, options);
      setStatus(st);
      const accountEmail =
        provider === "google_calendar"
          ? (st.google_calendar_email ?? "compte")
          : (st.email ?? "compte");
      const providerLabel =
        provider === "google_calendar"
          ? "Google Agenda"
          : provider === "google"
            ? "Google"
            : "Microsoft";
      toast.success(
        options?.forceConsent
          ? `${providerLabel} reconnecté : ${accountEmail}`
          : provider === "google_calendar"
            ? `Google Agenda connecté : ${accountEmail}`
            : `Connecté : ${accountEmail}`
      );
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

  const body = loading ? (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Chargement de la connexion…
    </div>
  ) : (
    <div className="space-y-5">
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
                Prêt pour Suivi → Envois. « Tester » vérifie l&apos;envoi
                {status?.provider === "google" || status?.google_calendar_connected
                  ? " et Google Agenda."
                  : status?.provider === "microsoft"
                    ? ". Connectez Google Agenda ci-dessous pour la détection RDV."
                    : "."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {status?.provider === "google" && (
              <Button
                variant="outline"
                size="sm"
                disabled={!!connecting}
                onClick={() => void handleConnect("google", { forceConsent: true })}
              >
                {connecting === "google" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-1" />
                )}
                Reconnecter Google
              </Button>
            )}
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
      ) : null}

      {oauthConnected && status?.provider === "microsoft" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-blue-950">Google Agenda (optionnel)</p>
            <p className="text-sm text-blue-900/90 truncate">
              {status.google_calendar_connected
                ? `Connecté — ${status.google_calendar_email ?? "compte"}`
                : "Pour détecter les RDV pris par vos clients (campagnes Suivi)."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {status.google_calendar_connected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!connecting}
                  onClick={() => void handleConnect("google_calendar", { forceConsent: true })}
                >
                  Reconnecter Agenda
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await disconnectGoogleCalendarOAuth();
                      await refresh();
                      toast.success("Google Agenda déconnecté");
                    } catch {
                      toast.error("Erreur lors de la déconnexion Agenda");
                    }
                  }}
                >
                  Déconnecter Agenda
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={
                  !!connecting ||
                  !googleClientId.trim() ||
                  (!googleSecretConfigured && !googleClientSecret.trim())
                }
                onClick={() => void handleConnect("google_calendar")}
              >
                {connecting === "google_calendar" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-1" />
                )}
                Connecter Google Agenda
              </Button>
            )}
          </div>
        </div>
      )}

      {!oauthConnected ? (
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
      ) : null}

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
