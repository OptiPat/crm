import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getLicenseStatus, type LicenseStatusView } from "@/lib/api/tauri-license";
import { Button } from "@/components/ui/button";

interface LicenseStatusBannerProps {
  onOpenSettings?: () => void;
}

export function LicenseStatusBanner({ onOpenSettings }: LicenseStatusBannerProps) {
  const [status, setStatus] = useState<LicenseStatusView | null>(null);

  useEffect(() => {
    const load = () => {
      void getLicenseStatus()
        .then(setStatus)
        .catch(() => setStatus(null));
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!status?.installation_id) return null;

  const warningSoon =
    status.is_valid &&
    status.days_remaining != null &&
    status.days_remaining <= 7 &&
    status.status !== "legacy";

  const warningMonth =
    status.is_valid &&
    status.days_remaining != null &&
    status.days_remaining > 7 &&
    status.days_remaining <= 30 &&
    status.status !== "legacy";

  if (!status.is_valid) {
    return (
      <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Licence expirée — l&apos;application est en lecture seule jusqu&apos;au renouvellement.</span>
        </div>
        {onOpenSettings && (
          <Button size="sm" variant="outline" onClick={onOpenSettings}>
            Renouveler
          </Button>
        )}
      </div>
    );
  }

  if (warningSoon) {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Votre licence expire dans {status.days_remaining} jour
            {status.days_remaining === 1 ? "" : "s"}.
          </span>
        </div>
        {onOpenSettings && (
          <Button size="sm" variant="outline" onClick={onOpenSettings}>
            Voir la licence
          </Button>
        )}
      </div>
    );
  }

  if (warningMonth) {
    return (
      <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Votre licence expire dans {status.days_remaining} jours.</span>
        </div>
        {onOpenSettings && (
          <Button size="sm" variant="outline" onClick={onOpenSettings}>
            Voir la licence
          </Button>
        )}
      </div>
    );
  }

  return null;
}
