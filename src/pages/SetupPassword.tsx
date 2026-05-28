import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Check, Copy, Eye, EyeOff, Lock } from "lucide-react";

interface SetupPasswordProps {
  onPasswordCreated: () => void;
}

export function SetupPassword({ onPasswordCreated }: SetupPasswordProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [copied, setCopied] = useState(false);

  const getPasswordStrength = (pwd: string) => {
    if (pwd.length === 0) return { level: 0, text: "", color: "" };
    if (pwd.length < 8)
      return { level: 1, text: "Très faible", color: "bg-red-500" };
    if (pwd.length < 12)
      return { level: 2, text: "Faible", color: "bg-orange-500" };
    
    let strength = 2;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;
    
    if (strength >= 5)
      return { level: 4, text: "Très fort", color: "bg-green-500" };
    if (strength >= 4) return { level: 3, text: "Fort", color: "bg-green-400" };
    return { level: 2, text: "Moyen", color: "bg-yellow-500" };
  };

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validations
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);

    try {
      const key = await invoke<string>("create_master_password", { password });
      setRecoveryKey(key);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  const handleCopyRecoveryKey = () => {
    navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContinue = () => {
    onPasswordCreated();
  };

  if (recoveryKey) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <Card className="max-w-2xl w-full">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-green-100 rounded-full">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle>Mot de passe créé avec succès</CardTitle>
            </div>
            <CardDescription>
              Sauvegardez votre clé de récupération en lieu sûr
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold mb-1">Important !</p>
                  <p>
                    Cette clé de récupération vous permet de récupérer l'accès à
                    votre CRM si vous oubliez votre mot de passe. Sauvegardez-la
                    dans un endroit sûr (gestionnaire de mots de passe, coffre-fort, etc.).
                  </p>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">
                Clé de récupération
              </Label>
              <div className="relative">
                <Input
                  value={recoveryKey}
                  readOnly
                  className="font-mono text-sm pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-8 w-8"
                  onClick={handleCopyRecoveryKey}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {copied && (
                <p className="text-sm text-green-600 mt-1">
                  Clé copiée dans le presse-papiers
                </p>
              )}
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Conseil :</strong> Notez cette clé et conservez-la dans un
                endroit sûr, séparé de votre ordinateur. Vous en aurez besoin si
                vous oubliez votre mot de passe.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleContinue} className="w-full" size="lg">
              J'ai sauvegardé ma clé, continuer
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-primary/10 rounded-full mb-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-primary mb-2">
            Bienvenue dans Patrimoine CRM
          </h1>
          <p className="text-muted-foreground">
            Créez un mot de passe maître pour sécuriser vos données
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Créer un mot de passe</CardTitle>
            <CardDescription>
              Ce mot de passe protégera toutes vos données clients
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe maître</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Entrez un mot de passe fort..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {password && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${strength.color}`}
                        style={{ width: `${(strength.level / 4) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {strength.text}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  Confirmer le mot de passe
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmez votre mot de passe..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-8 w-8"
                    onClick={() => setShowConfirm(!showConfirm)}
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="bg-muted p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  Recommandations : au moins 12 caractères, avec majuscules,
                  chiffres et caractères spéciaux.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading || !password || !confirmPassword}
              >
                {loading ? "Création en cours..." : "Créer le mot de passe"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
