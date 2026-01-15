import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, AlertCircle } from "lucide-react";

interface UnlockScreenProps {
  onUnlocked: () => void;
}

export function UnlockScreen({ onUnlocked }: UnlockScreenProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const isValid = await invoke<boolean>("verify_master_password", {
        password,
      });

      if (isValid) {
        onUnlocked();
      } else {
        setAttempts(attempts + 1);
        setError("Mot de passe incorrect");
        setPassword("");
        
        if (attempts >= 2) {
          setError(
            "Mot de passe incorrect. Si vous l'avez oublié, utilisez votre clé de récupération."
          );
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit(e as any);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-primary/10 rounded-full mb-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-primary mb-2">
            Patrimoine CRM
          </h1>
          <p className="text-muted-foreground">
            Entrez votre mot de passe pour déverrouiller
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Déverrouillage</CardTitle>
            <CardDescription>
              Saisissez votre mot de passe maître
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Entrez votre mot de passe..."
                    className="pr-10"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading || !password}
              >
                {loading ? "Vérification..." : "Déverrouiller"}
              </Button>
            </form>

            {attempts >= 3 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground text-center mb-2">
                  Mot de passe oublié ?
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    // TODO: Implémenter la récupération par clé
                    alert("Fonctionnalité de récupération à implémenter");
                  }}
                >
                  Utiliser la clé de récupération
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Vos données sont chiffrées et protégées localement
        </p>
      </div>
    </div>
  );
}
