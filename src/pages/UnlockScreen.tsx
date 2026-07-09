import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppBranding } from "@/components/app-branding/AppBrandingProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertCircle, Eye, EyeOff, ShieldCheck } from "lucide-react";

interface UnlockScreenProps {
  onUnlocked: () => void;
}

export function UnlockScreen({ onUnlocked }: UnlockScreenProps) {
  const { displayName, logoSrc } = useAppBranding();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await invoke<boolean>("unlock", { password });
      onUnlocked();
    } catch {
      setPassword("");
      setError("Mot de passe incorrect");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-gradient-to-b from-primary/[0.04] via-background to-background flex items-center justify-center p-6 sm:p-10">
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

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                    <p className="text-sm sm:text-base text-red-800">{error}</p>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                size="lg"
                disabled={loading || !password}
              >
                {loading ? "Vérification…" : "Déverrouiller"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm sm:text-base text-muted-foreground text-center px-4 max-w-md mx-auto">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary/70" aria-hidden />
          <span>
            Accès protégé par mot de passe — vos données restent sur cet ordinateur
          </span>
        </p>
      </div>
    </div>
  );
}
