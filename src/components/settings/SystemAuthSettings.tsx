import { useEffect, useState } from "react";
import { AlertCircle, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  configureSystemAuth,
  getSystemAuthStatus,
  parseAuthCommandError,
  type SystemAuthStatus,
} from "@/lib/api/tauri-auth";

export function SystemAuthSettings() {
  const [status, setStatus] = useState<SystemAuthStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetEnabled, setTargetEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getSystemAuthStatus()
      .then(setStatus)
      .catch((caught) => setError(parseAuthCommandError(caught).message));
  }, []);

  const openConfiguration = (enabled: boolean) => {
    setTargetEnabled(enabled);
    setPassword("");
    setError("");
    setDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setPassword("");
      setError("");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const nextStatus = await configureSystemAuth(password, targetEnabled);
      setStatus(nextStatus);
      handleDialogChange(false);
      toast.success(
        targetEnabled
          ? "Double authentification système activée"
          : "Double authentification système désactivée",
      );
    } catch (caught) {
      setError(parseAuthCommandError(caught).message);
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  const canEnable = Boolean(status?.supported);

  return (
    <>
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <Fingerprint className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="space-y-3 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Double authentification système</p>
            {status && (
              <Badge variant={status.enabled ? "default" : "outline"}>
                {status.enabled ? "Activée" : "Désactivée"}
              </Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Après le mot de passe du CRM, demande une confirmation avec{" "}
            {status?.label ?? "Windows Hello ou Touch ID"}. Aucun secret biométrique n’est stocké
            par le CRM.
          </p>

          {status?.detail && !status.available && (
            <p className="text-xs text-amber-700">{status.detail}</p>
          )}
          {error && !dialogOpen && <p className="text-xs text-red-700">{error}</p>}

          {status?.enabled ? (
            <Button variant="outline" size="sm" onClick={() => openConfiguration(false)}>
              Désactiver
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openConfiguration(true)}
              disabled={!canEnable}
            >
              Activer et tester
            </Button>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {targetEnabled
                  ? "Activer la double authentification"
                  : "Désactiver la double authentification"}
              </DialogTitle>
              <DialogDescription>
                Saisissez le mot de passe du CRM. Une fenêtre{" "}
                {status?.label ?? "système"} vérifiera ensuite cette modification si le mécanisme
                est disponible.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="systemAuthPassword">Mot de passe du CRM</Label>
                <Input
                  id="systemAuthPassword"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                />
              </div>

              {error && (
                <div
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading || !password}>
                {loading
                  ? "Vérification…"
                  : targetEnabled
                    ? "Activer et tester"
                    : "Désactiver"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
