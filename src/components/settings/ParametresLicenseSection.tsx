import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import {
  activateLicense,
  getLicenseStatus,
  startLicenseTrial,
  type LicenseStatusView,
} from "@/lib/api/tauri-license";
import { KeyRound, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("fr-FR");
}

function statusLabel(status: LicenseStatusView): string {
  if (status.is_valid && status.expires_at == null) {
    if (status.legacy) return "Active";
    if (status.status === "trial") return "Accès gratuit";
    if (status.status === "active") return "Active";
  }
  switch (status.status) {
    case "trial":
      return "Essai";
    case "active":
      return "Active";
    case "legacy":
      return "Installation existante";
    case "expired":
      return "Expirée";
    default:
      return status.status;
  }
}

export function ParametresLicenseSection() {
  const [status, setStatus] = useState<LicenseStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setStatus(await getLicenseStatus());
    } catch (error) {
      console.error(error);
      toast.error("Impossible de charger la licence.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleActivate = async () => {
    if (!status?.client_email) {
      toast.error("Email client manquant.");
      return;
    }
    setActivating(true);
    try {
      const next = await activateLicense({
        licenseKey,
        clientEmail: status.client_email,
        clientName: status.client_name ?? undefined,
        cabinet: status.cabinet ?? undefined,
      });
      setStatus(next);
      setLicenseKey("");
      toast.success("Licence activée.");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setActivating(false);
    }
  };

  const handleRestartTrial = async () => {
    if (!status?.client_email) return;
    setActivating(true);
    try {
      const next = await startLicenseTrial({
        clientEmail: status.client_email,
        clientName: status.client_name ?? undefined,
        cabinet: status.cabinet ?? undefined,
        allowRestart: true,
      });
      setStatus(next);
      toast.success("Essai relancé.");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <SettingsPanel title="Licence" description="Chargement…">
        <p className="text-sm text-muted-foreground">Chargement du statut…</p>
      </SettingsPanel>
    );
  }

  if (!status?.installation_id) {
    return (
      <SettingsPanel
        title="Licence"
        description="Aucune activation enregistrée sur ce poste."
      >
        <p className="text-sm text-muted-foreground">
          Relancez l&apos;application pour afficher l&apos;écran d&apos;activation.
        </p>
      </SettingsPanel>
    );
  }

  return (
    <SettingsPanel
      title="Licence"
      description="Statut de cette installation sur ce poste."
      action={
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Actualiser
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={status.is_valid ? "secondary" : "destructive"}>
            {statusLabel(status)}
          </Badge>
          {status.license_type && (
            <Badge variant="outline" className="font-normal">
              {status.license_type}
            </Badge>
          )}
          {status.legacy && status.expires_at != null && (
            <Badge variant="outline" className="font-normal">
              Migration
            </Badge>
          )}
        </div>

        {status.registry_configured && (
          <p className="text-sm text-muted-foreground">
            Registre éditeur :{" "}
            {status.registry_synced ? "synchronisé" : "en attente de synchronisation"}
          </p>
        )}
        {!status.registry_configured && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Registre non compilé dans ce build (relancez <code className="text-xs">.\dev.ps1</code>{" "}
            avec <code className="text-xs">license-build.local.ps1</code>).
          </p>
        )}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{status.client_email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Installé le</dt>
            <dd>{formatDate(status.installed_at)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Activé le</dt>
            <dd>{formatDate(status.activated_at)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Expire le</dt>
            <dd>
              {status.expires_at != null
                ? formatDate(status.expires_at)
                : status.is_valid
                  ? "Sans expiration"
                  : "—"}
            </dd>
          </div>
          {status.days_remaining != null && status.expires_at != null && (
            <div>
              <dt className="text-muted-foreground">Jours restants</dt>
              <dd>{status.days_remaining}</dd>
            </div>
          )}
          {status.license_key_masked && (
            <div>
              <dt className="text-muted-foreground">Clé</dt>
              <dd className="font-mono">{status.license_key_masked}</dd>
            </div>
          )}
        </dl>

        {!status.is_valid && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm text-amber-900">
              Cette installation n&apos;a plus de licence valide. Saisissez une clé ou
              contactez l&apos;éditeur.
            </p>
            <div className="space-y-2">
              <Label htmlFor="renew-license-key">Nouvelle clé</Label>
              <Input
                id="renew-license-key"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                placeholder="ANNU-2706-XXXX-XXXX"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={activating || licenseKey.trim().length < 10} onClick={() => void handleActivate()}>
                <KeyRound className="h-4 w-4 mr-1.5" />
                Activer une clé
              </Button>
              <Button variant="outline" disabled={activating || !status.can_restart_trial} onClick={() => void handleRestartTrial()}>
                Relancer un essai
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingsPanel>
  );
}
