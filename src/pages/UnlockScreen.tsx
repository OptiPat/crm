import { useEffect, useState } from "react";
import { useAppBranding } from "@/components/app-branding/AppBrandingProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  formatRetryDelay,
  getSystemAuthStatus,
  parseAuthCommandError,
  recoverMissingTeamCache,
  recoverWithoutSystemAuth,
  type SystemAuthStatus,
  unlockWithPassword,
} from "@/lib/api/tauri-auth";
import { AlertCircle, Eye, EyeOff, Fingerprint, ShieldCheck } from "lucide-react";

interface UnlockScreenProps {
  onUnlocked: () => void;
}

export function UnlockScreen({ onUnlocked }: UnlockScreenProps) {
  const { displayName, logoSrc } = useAppBranding();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [systemAuth, setSystemAuth] = useState<SystemAuthStatus | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [teamCacheRecoveryAvailable, setTeamCacheRecoveryAvailable] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    void getSystemAuthStatus()
      .then(setSystemAuth)
      .catch(() => setSystemAuth(null));
  }, []);

  useEffect(() => {
    if (!blockedUntil) {
      setRemainingSeconds(0);
      return;
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        setBlockedUntil(null);
        setError("");
      }
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [blockedUntil]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (remainingSeconds > 0) return;
    setError("");
    setRecoveryAvailable(false);
    setTeamCacheRecoveryAvailable(false);
    setLoading(true);

    try {
      await unlockWithPassword(password);
      onUnlocked();
    } catch (caught) {
      const authError = parseAuthCommandError(caught);
      setError(authError.message);
      if (authError.code === "rate_limited" && authError.retryAfterSeconds) {
        setBlockedUntil(Date.now() + authError.retryAfterSeconds * 1000);
      }
      if (authError.code === "system_auth_unavailable") {
        setRecoveryAvailable(true);
      } else if (
        authError.message.includes("Cache équipe") ||
        authError.message.includes("manifeste local absent")
      ) {
        setTeamCacheRecoveryAvailable(true);
      } else {
        setPassword("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTeamCacheRecovery = async () => {
    if (remainingSeconds > 0) return;
    setError("");
    setLoading(true);
    try {
      await recoverMissingTeamCache(password);
      setTeamCacheRecoveryAvailable(false);
      setError("Cache équipe restauré. Vous pouvez maintenant déverrouiller le CRM.");
    } catch (caught) {
      const authError = parseAuthCommandError(caught);
      setError(authError.message);
      if (authError.code === "rate_limited" && authError.retryAfterSeconds) {
        setBlockedUntil(Date.now() + authError.retryAfterSeconds * 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async () => {
    if (remainingSeconds > 0) return;
    setError("");
    setLoading(true);
    try {
      await recoverWithoutSystemAuth(password);
      onUnlocked();
    } catch (caught) {
      const authError = parseAuthCommandError(caught);
      setError(authError.message);
      if (authError.code === "rate_limited" && authError.retryAfterSeconds) {
        setBlockedUntil(Date.now() + authError.retryAfterSeconds * 1000);
      }
      setPassword("");
      setRecoveryAvailable(false);
    } finally {
      setLoading(false);
    }
  };

  const displayedError =
    remainingSeconds > 0
      ? `Trop de tentatives incorrectes. Réessayez dans ${formatRetryDelay(remainingSeconds)}.`
      : error;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/[0.04] via-background to-background flex items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-lg space-y-8">
        <header className="flex items-center justify-center gap-4 sm:gap-5">
          <img
            src={logoSrc}
            alt=""
            width={80}
            height={80}
            className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 object-contain rounded-xl bg-white p-1"
          />
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary tracking-tight leading-tight">
            {displayName}
          </h1>
        </header>

        <Card className="border-border/70 shadow-md">
          <CardContent className="px-8 py-8 sm:px-10 sm:py-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <p id="password-hint" className="text-base sm:text-lg text-muted-foreground">
                  Entrez votre mot de passe pour déverrouiller
                </p>
                {systemAuth?.enabled && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Fingerprint className="h-4 w-4 text-primary" aria-hidden />
                    Une confirmation avec {systemAuth.label} sera ensuite demandée.
                  </p>
                )}
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 pr-12 text-base"
                    aria-describedby="password-hint"
                    autoFocus
                    autoComplete="current-password"
                    aria-label="Mot de passe du CRM"
                    disabled={remainingSeconds > 0}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-10 w-10"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              {displayedError && (
                <div
                  className="bg-red-50 border border-red-200 rounded-lg p-4"
                  role={remainingSeconds > 0 ? "status" : "alert"}
                  aria-live={remainingSeconds > 0 ? "polite" : "assertive"}
                  aria-atomic="true"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                    <div className="space-y-3">
                      <p className="text-sm sm:text-base text-red-800">{displayedError}</p>
                      {recoveryAvailable && (
                        <div className="space-y-2">
                          <p className="text-xs text-red-700">
                            Si ce poste a changé ou si le capteur n’est plus utilisable, l’accès de
                            récupération désactive la protection système après vérification du mot
                            de passe.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleRecovery}
                            disabled={loading || !password}
                          >
                            Accès de récupération
                          </Button>
                        </div>
                      )}
                      {teamCacheRecoveryAvailable && (
                        <div className="space-y-2">
                          <p className="text-xs text-red-700">
                            Le cache local peut être reconstruit depuis les données SharePoint
                            après vérification de votre identité.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleTeamCacheRecovery}
                            disabled={loading || !password}
                          >
                            Restaurer le cache équipe
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                size="lg"
                disabled={loading || !password || remainingSeconds > 0}
              >
                {loading
                  ? "Vérification…"
                  : remainingSeconds > 0
                    ? `Réessayer dans ${formatRetryDelay(remainingSeconds)}`
                    : "Déverrouiller"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm sm:text-base text-muted-foreground text-center px-4 max-w-md mx-auto">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary/70" aria-hidden />
          <span>
            {systemAuth?.enabled
              ? `Accès protégé par mot de passe et ${systemAuth.label}`
              : "Accès protégé par mot de passe — vos données restent sur cet ordinateur"}
          </span>
        </p>
      </div>
    </div>
  );
}
