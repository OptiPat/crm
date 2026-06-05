import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Check, Copy, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { APP_DISPLAY_NAME, APP_LOGO_URL } from "@/lib/app-branding";

interface UnlockScreenProps {
  onUnlocked: () => void;
}

type Mode = "unlock" | "recover" | "recovered";

export function UnlockScreen({ onUnlocked }: UnlockScreenProps) {
  const [mode, setMode] = useState<Mode>("unlock");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);

  // Récupération
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newRecoveryKey, setNewRecoveryKey] = useState("");
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await invoke<boolean>("unlock", { password });
      onUnlocked();
    } catch {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setPassword("");
      setError(
        nextAttempts >= 3
          ? "Mot de passe incorrect. Si vous l'avez oublié, utilisez votre clé de récupération."
          : "Mot de passe incorrect"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);
    try {
      await invoke<boolean>("recover_account", {
        recoveryKey: recoveryKey.trim(),
        newPassword,
      });
      try {
        const pending = await invoke<string | null>("get_pending_recovery_key");
        setNewRecoveryKey(pending ?? "");
      } catch {
        setNewRecoveryKey("");
      }
      setMode("recovered");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNewKey = () => {
    navigator.clipboard.writeText(newRecoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderHeader = () => (
    <header className="flex items-center justify-center gap-4 sm:gap-5">
      <img
        src={APP_LOGO_URL}
        alt=""
        width={80}
        height={80}
        className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 object-contain"
      />
      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary tracking-tight leading-tight">
        {APP_DISPLAY_NAME}
      </h1>
    </header>
  );

  const renderError = () =>
    error ? (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm sm:text-base text-red-800">{error}</p>
        </div>
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/[0.04] via-background to-background flex items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-lg space-y-8">
        {renderHeader()}

        <Card className="border-border/70 shadow-md">
          <CardContent className="px-8 py-8 sm:px-10 sm:py-10">
            {mode === "unlock" && (
              <>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-3">
                    <p id="password-hint" className="text-base sm:text-lg text-muted-foreground">
                      Entrez votre mot de passe pour déverrouiller
                    </p>
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
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-10 w-10"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                        aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </Button>
                    </div>
                  </div>

                  {renderError()}

                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold"
                    size="lg"
                    disabled={loading || !password}
                  >
                    {loading ? "Vérification…" : "Déverrouiller"}
                  </Button>
                </form>

                {attempts >= 3 && (
                  <div className="mt-6 pt-6 border-t border-border/60 space-y-3">
                    <p className="text-sm text-muted-foreground text-center">Mot de passe oublié ?</p>
                    <Button
                      variant="outline"
                      className="w-full h-11 text-base"
                      onClick={() => {
                        setError("");
                        setMode("recover");
                      }}
                    >
                      Utiliser la clé de récupération
                    </Button>
                  </div>
                )}
              </>
            )}

            {mode === "recover" && (
              <form onSubmit={handleRecover} className="space-y-5">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">Récupération de l'accès</h2>
                  <p className="text-sm text-muted-foreground">
                    Saisissez votre clé de récupération, puis choisissez un nouveau mot de passe.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recoveryKey">Clé de récupération</Label>
                  <Input
                    id="recoveryKey"
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    placeholder="alpha-bravo-charlie-…"
                    className="font-mono"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                {renderError()}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-11"
                    onClick={() => {
                      setError("");
                      setMode("unlock");
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 h-11 font-semibold"
                    disabled={loading || !recoveryKey || !newPassword || !confirmPassword}
                  >
                    {loading ? "Récupération…" : "Récupérer l'accès"}
                  </Button>
                </div>
              </form>
            )}

            {mode === "recovered" && (
              <div className="space-y-5">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-green-100 rounded-full">
                    <Check className="h-6 w-6 text-green-600" />
                  </div>
                  <h2 className="text-xl font-semibold">Accès rétabli</h2>
                </div>

                {newRecoveryKey && (
                  <>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-yellow-800">
                          Voici votre <strong>nouvelle</strong> clé de récupération. L'ancienne n'est
                          plus valable. Conservez celle-ci en lieu sûr.
                        </p>
                      </div>
                    </div>
                    <div className="relative">
                      <Input value={newRecoveryKey} readOnly className="font-mono text-sm pr-10" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-8 w-8"
                        onClick={handleCopyNewKey}
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </>
                )}

                <Button className="w-full h-11 font-semibold" onClick={onUnlocked}>
                  Continuer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="flex items-center justify-center gap-2 text-sm sm:text-base text-muted-foreground text-center px-4">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary/70" aria-hidden />
          Vos données sont chiffrées localement et protégées par votre mot de passe
        </p>
      </div>
    </div>
  );
}
